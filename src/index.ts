import express, { Request, Response } from "express";
import simpleGit from "simple-git";
import path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";
import { TypescriptExtractor } from "@ts-docs/extractor";
import { GoogleGenerativeAI } from "@google/generative-ai";
import fs from "fs/promises";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const port = 3000;

// Initialize Gemini AI with your API key
const genAI = new GoogleGenerativeAI("AIzaSyDSdJX7Jyn7eiPL7FT5g9f9MopBNIPCUu0");

app.use(express.json());
app.use(express.static("public"));

// Serve landing page at root
app.get("/", (req: Request, res: Response) => {
  res.sendFile(path.join(path.dirname(__dirname), "public", "landing.html"));
});

// Serve app interface at /app
app.get("/app", (req: Request, res: Response) => {
  res.sendFile(path.join(path.dirname(__dirname), "public", "index.html"));
});

app.get("/repos", async (req: Request, res: Response) => {
  try {
    const reposDir = path.join(path.dirname(__dirname), "repos");
    const entries = await fs.readdir(reposDir, { withFileTypes: true });
    const repos = entries.filter(entry => entry.isDirectory()).map(entry => entry.name);
    res.json(repos);
  } catch (error) {
    res.json([]);
  }
});

app.post("/clone", async (req: Request, res: Response) => {
  const { repoUrl } = req.body;
  if (!repoUrl) {
    return res.status(400).send("Repository URL is required");
  }

  const repoName = repoUrl.split("/").pop()?.replace(".git", "");
  if (!repoName) {
    return res.status(400).send("Invalid repository URL");
  }
  const repoDir = path.join(path.dirname(__dirname), "repos", repoName);

  try {
    console.log(`Cloning ${repoUrl} to ${repoDir}...`);
    await simpleGit().clone(repoUrl, repoDir);
    console.log("Repository cloned successfully.");
    res.send(`Repository cloned successfully to ${repoDir}`);
  } catch (error) {
    console.error("Failed to clone repository:", error);
    res.status(500).send("Failed to clone repository");
  }
});

// Function to read all code files in a directory
async function readAllCodeFiles(dir: string): Promise<{ [key: string]: string }> {
  const files: { [key: string]: string } = {};

  async function readDir(currentDir: string) {
    const entries = await fs.readdir(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      const relativePath = path.relative(dir, fullPath);

      if (entry.isDirectory()) {
        await readDir(fullPath);
      } else if (
        entry.isFile() &&
        (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx") ||
         entry.name.endsWith(".js") || entry.name.endsWith(".jsx") ||
         entry.name.endsWith(".py") || entry.name.endsWith(".java") ||
         entry.name.endsWith(".cpp") || entry.name.endsWith(".c") ||
         entry.name.endsWith(".cs") || entry.name.endsWith(".go") ||
         entry.name.endsWith(".rs") || entry.name.endsWith(".php") ||
         entry.name.endsWith(".rb") || entry.name.endsWith(".swift") ||
         entry.name.endsWith(".kt") || entry.name.endsWith(".scala"))
      ) {
        const content = await fs.readFile(fullPath, "utf-8");
        files[relativePath] = content;
      }
    }
  }

  await readDir(dir);
  return files;
}

// Function to generate documentation using Gemini AI
async function generateDocumentationWithAI(
  repoName: string,
  files: { [key: string]: string }
): Promise<string> {
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    // Detect programming languages in the project
    const languages = new Set<string>();
    Object.keys(files).forEach(filePath => {
      const ext = path.extname(filePath).toLowerCase();
      const langMap: { [key: string]: string } = {
        '.ts': 'typescript', '.tsx': 'typescript',
        '.js': 'javascript', '.jsx': 'javascript',
        '.py': 'python', '.java': 'java',
        '.cpp': 'cpp', '.c': 'c',
        '.cs': 'csharp', '.go': 'go',
        '.rs': 'rust', '.php': 'php',
        '.rb': 'ruby', '.swift': 'swift',
        '.kt': 'kotlin', '.scala': 'scala'
      };
      if (langMap[ext]) languages.add(langMap[ext]);
    });

    const primaryLang = Array.from(languages)[0] || 'unknown';
    const allLanguages = Array.from(languages).join(', ');

    // Create a prompt with all file contents
    let prompt = `Analyze the following ${allLanguages} project "${repoName}" and generate accurate documentation based ONLY on what the code actually does. Do not make assumptions or add features that don't exist.\n\n`;

    for (const [filePath, content] of Object.entries(files)) {
      const ext = path.extname(filePath).toLowerCase();
      const langMap: { [key: string]: string } = {
        '.ts': 'typescript', '.tsx': 'typescript',
        '.js': 'javascript', '.jsx': 'javascript',
        '.py': 'python', '.java': 'java',
        '.cpp': 'cpp', '.c': 'c',
        '.cs': 'csharp', '.go': 'go',
        '.rs': 'rust', '.php': 'php',
        '.rb': 'ruby', '.swift': 'swift',
        '.kt': 'kotlin', '.scala': 'scala'
      };
      const lang = langMap[ext] || 'text';
      prompt += `File: ${filePath}\n\`\`\`${lang}\n${content}\n\`\`\`\n\n`;
    }

    prompt += `Based on the actual code above, provide:
        1. Project Overview: What this code actually does (analyze the imports, functions, classes, and logic)
        2. Programming Languages: List the languages used (${allLanguages})
        3. Architecture: Describe the actual structure and components found in the code
        4. API Endpoints: List ONLY the actual HTTP endpoints/routes defined in the code with their methods, paths, and what they do
        5. Functions & Classes: Document ONLY the functions, classes, and methods that actually exist in the code
        6. Dependencies: List the actual packages, imports, and libraries used
        7. Setup & Usage: How to actually run and use this specific codebase based on the language(s) and dependencies found
        
        IMPORTANT: Base your documentation ONLY on what you can see in the provided code. Do not add hypothetical features, endpoints, or functionality that doesn't exist in the actual code.
        
        Format the response as clean HTML without \`\`\`html tags.`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    return response.text();
  } catch (error) {
    console.error("Failed to generate documentation with AI:", error);
    return "<p>Failed to generate documentation with AI. Please try again later.</p>";
  }
}

app.post("/parse", async (req: Request, res: Response) => {
  const { repoName } = req.body;
  if (!repoName) {
    return res.status(400).json({ error: "Repository name is required" });
  }

  const repoDir = path.join(path.dirname(__dirname), "repos", repoName);
  
  try {
    // Read all code files instead of using the problematic extractor
    const files = await readAllCodeFiles(repoDir);
    
    const project = {
      modules: Object.keys(files).map(filePath => ({
        name: path.basename(filePath, '.ts'),
        classes: [],
        interfaces: [],
        functions: [],
        content: files[filePath]
      }))
    };
    
    res.json(project);
  } catch (error) {
    console.error("Failed to parse repository:", error);
    res.status(500).json({ error: "Failed to parse repository", details: (error as Error).message });
  }
});

const manualContent: { [key: string]: string } = {};

app.post("/save-content", (req: Request, res: Response) => {
  const { repoName, moduleName, content } = req.body;
  if (!repoName || !moduleName || !content) {
    return res
      .status(400)
      .send("repoName, moduleName, and content are required");
  }
  const key = `${repoName}/${moduleName}`;
  manualContent[key] = content;
  res.send("Content saved");
});

export interface Project {
  modules: Module[];
}

export interface Module {
  name: string;
  classes: any[];
  interfaces: any[];
  functions: any[];
}

export function generateDocsHtml(
  project: Project,
  repoName: string,
  aiContent: string,
  files: { [key: string]: string } = {}
): string {
  // Pre-process modules with their file content
  const modulesWithContent = project.modules.map(module => {
    const matchingFile = Object.keys(files).find(f => {
      const baseName = path.basename(f, path.extname(f));
      return baseName === module.name;
    });
    const content = matchingFile ? files[matchingFile] : 'Content not available';
    const escapedContent = content.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return { ...module, fileContent: escapedContent, filePath: matchingFile || 'Unknown' };
  });
  return `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>${repoName} API Documentation | Generated by EchoDocs AI</title>
            <meta name="description" content="Comprehensive API documentation for ${repoName} project. Auto-generated using AI analysis of the codebase with detailed endpoints, functions, and usage examples.">
            <meta name="keywords" content="${repoName} documentation, API docs, ${repoName} API, code documentation, developer reference">
            <meta name="robots" content="index, follow">
            
            <!-- Open Graph -->
            <meta property="og:type" content="article">
            <meta property="og:title" content="${repoName} API Documentation">
            <meta property="og:description" content="Comprehensive API documentation for ${repoName} project generated by EchoDocs AI.">
            
            <!-- JSON-LD Structured Data -->
            <script type="application/ld+json">
            {
              "@context": "https://schema.org",
              "@type": "SoftwareApplication",
              "name": "${repoName}",
              "description": "API documentation for ${repoName} project",
              "applicationCategory": "DeveloperApplication",
              "operatingSystem": "Cross-platform"
            }
            </script>
            <style>
                body { 
                    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
                    line-height: 1.6;
                    color: #333;
                    max-width: 1200px;
                    margin: 0 auto;
                    padding: 20px;
                    background-color: #f8f9fa;
                }
                header {
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    color: white;
                    padding: 2rem;
                    border-radius: 8px;
                    margin-bottom: 2rem;
                    box-shadow: 0 4px 6px rgba(0,0,0,0.1);
                }
                h1, h2, h3 { 
                    color: #2c3e50;
                    margin-top: 1.5rem;
                }
                h1 { 
                    font-size: 2.5rem;
                    margin: 0;
                }
                .module { 
                    background: white;
                    border: 1px solid #e1e8ed;
                    border-radius: 8px;
                    padding: 1.5rem;
                    margin-bottom: 1.5rem;
                    box-shadow: 0 2px 4px rgba(0,0,0,0.05);
                }
                .module-name { 
                    font-size: 1.8rem;
                    font-weight: 600;
                    color: #2c3e50;
                    margin-bottom: 1rem;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                }
                .member { 
                    margin: 1rem 0;
                    padding: 1rem;
                    background-color: #f8f9fa;
                    border-radius: 6px;
                    border-left: 4px solid #667eea;
                }
                .editor { 
                    display: none; 
                    margin-top: 1rem;
                    padding: 1rem;
                    background: white;
                    border-radius: 6px;
                    box-shadow: 0 2px 10px rgba(0,0,0,0.1);
                }
                .manual-content { 
                    background-color: #e3f2fd;
                    padding: 1rem;
                    margin-top: 1rem;
                    border-radius: 6px;
                    border-left: 4px solid #2196f3;
                }
                button {
                    background: #667eea;
                    color: white;
                    border: none;
                    padding: 0.5rem 1rem;
                    border-radius: 4px;
                    cursor: pointer;
                    font-weight: 500;
                    transition: background 0.3s;
                }
                button:hover {
                    background: #5a6fd8;
                }
                textarea {
                    width: 100%;
                    padding: 0.8rem;
                    border: 1px solid #ddd;
                    border-radius: 4px;
                    font-family: monospace;
                    resize: vertical;
                }
                .ai-content {
                    background: white;
                    padding: 2rem;
                    border-radius: 8px;
                    margin-bottom: 2rem;
                    box-shadow: 0 2px 8px rgba(0,0,0,0.1);
                }
                pre {
                    background: #2d2d2d;
                    color: #f8f8f2;
                    padding: 1rem;
                    border-radius: 6px;
                    overflow-x: auto;
                }
                code {
                    font-family: 'Fira Code', monospace;
                    background: #f1f1f1;
                    padding: 0.2rem 0.4rem;
                    border-radius: 4px;
                }
            </style>
        </head>
        <body>
            <header>
                <h1>${repoName} API Documentation</h1>
                <p>Comprehensive documentation generated with AI assistance</p>
            </header>
            
            <div class="ai-content">
                <h2>AI-Generated Documentation</h2>
                ${aiContent}
            </div>
            
            <div id="editor-container" class="editor">
                <textarea id="editor-textarea" rows="10"></textarea>
                <div style="margin-top: 1rem;">
                    <button id="editor-save">Save</button>
                    <button id="editor-cancel">Cancel</button>
                </div>
            </div>
            
            <h2>Technical Reference</h2>
            ${
              modulesWithContent.length > 0
                ? modulesWithContent
                    .map((module) => {
                      const moduleKey = `${repoName}/${module.name}`;
                      return `
                <div class="module">
                    <div class="module-name">
                        ${module.name} <span style="font-size: 0.8em; color: #666;">(${module.filePath})</span>
                        <button class="edit-button" data-module-name="${
                          module.name
                        }">Add Notes</button>
                    </div>
                    
                    <div class="manual-content" id="manual-content-${
                      module.name
                    }">
                        ${
                          manualContent[moduleKey] ||
                          "<em>No additional notes yet</em>"
                        }
                    </div>
                    
                    <div class="member">
                        <h3>File Content</h3>
                        <pre style="background: #f8f9fa; color: #333; padding: 1rem; border-radius: 4px; overflow-x: auto; white-space: pre-wrap; font-family: 'Courier New', monospace;"><code style="background: none; color: inherit;">${module.fileContent}</code></pre>
                    </div>
                </div>
                `;
                    })
                    .join("")
                : "<p>No code files found in the project</p>"
            }
            
            <script>
                const editorContainer = document.getElementById('editor-container');
                const editorTextarea = document.getElementById('editor-textarea');
                const editorSave = document.getElementById('editor-save');
                const editorCancel = document.getElementById('editor-cancel');
                let currentModuleName;

                document.querySelectorAll('.edit-button').forEach(button => {
                    button.addEventListener('click', (e) => {
                        currentModuleName = e.target.dataset.moduleName;
                        const moduleKey = \`${repoName}/\${currentModuleName}\`;
                        const content = document.getElementById(\`manual-content-\${currentModuleName}\`).innerText;
                        editorTextarea.value = content === 'No additional notes yet' ? '' : content;
                        editorContainer.style.display = 'block';
                        editorTextarea.focus();
                    });
                });

                editorCancel.addEventListener('click', () => {
                    editorContainer.style.display = 'none';
                });

                editorSave.addEventListener('click', () => {
                    const content = editorTextarea.value;
                    const repoName = '${repoName}';
                    const moduleName = currentModuleName;

                    fetch('/save-content', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ repoName, moduleName, content })
                    }).then(res => {
                        if (res.ok) {
                            const contentDiv = document.getElementById(\`manual-content-\${moduleName}\`);
                            contentDiv.innerHTML = content || '<em>No additional notes yet</em>';
                            editorContainer.style.display = 'none';
                        }
                    });
                });
            </script>
        </body>
        </html>
    `;
}

app.get("/docs/:repoName", async (req: Request, res: Response) => {
  const { repoName } = req.params;
  const repoDir = path.join(path.dirname(__dirname), "repos", repoName);

  try {
    // Read all code files in the repository
    const files = await readAllCodeFiles(repoDir);

    // Generate documentation with AI
    const aiContent = await generateDocumentationWithAI(repoName, files);

    // Create simple project structure
    const project: Project = {
      modules: Object.keys(files).map(filePath => ({
        name: path.basename(filePath, path.extname(filePath)),
        classes: [],
        interfaces: [],
        functions: []
      }))
    };

    const html = generateDocsHtml(project, repoName, aiContent, files);
    res.send(html);
  } catch (error) {
    console.error("Failed to generate documentation:", error);
    res.status(500).send("Failed to generate documentation");
  }
});

export function generateMockData(typeName: string): any {
  switch (typeName) {
    case "string":
      return "mock string";
    case "number":
      return 123;
    case "boolean":
      return true;
    default:
      return { message: `mock object for type ${typeName}` };
  }
}

app.all("/mock/:repoName/*splat", (req: Request, res: Response) => {
  const { repoName } = req.params;
  const requestedEndpoint = req.params.splat;

  const repoDir = path.join(path.dirname(__dirname), "repos", repoName);
  const entryPoint = path.join(repoDir, "src", "index.ts");
  try {
    const extractor = new TypescriptExtractor({ entryPoints: [entryPoint] });
    const project = extractor.run() as unknown as Project;
    let targetFunction: any;
    if (project.modules) {
      for (const module of project.modules) {
        if (module.functions) {
          targetFunction = module.functions.find(
            (f) => f.name === requestedEndpoint
          );
          if (targetFunction) break;
        }
      }
    }
    if (targetFunction) {
      const returnType = targetFunction.returnType || "object";
      const mockData = generateMockData(returnType);
      res.json(mockData);
    } else {
      res.status(404).send("Endpoint not found in documentation");
    }
  } catch (error) {
    console.error("Failed to generate mock data:", error);
    res.status(500).send("Failed to generate mock data");
  }
});
app.listen(port, () => {
  console.log(`Server is running at http://localhost:${port}`);
});
