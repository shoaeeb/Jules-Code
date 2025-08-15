import express, { Request, Response } from 'express';
import simpleGit from 'simple-git';
import path from 'path';
import { TypescriptExtractor } from '@ts-docs/extractor';

const app = express();
const port = 3000;

app.use(express.json()); // Middleware to parse JSON bodies
app.use(express.static('public'));

app.post('/clone', async (req: Request, res: Response) => {
    const { repoUrl } = req.body;
    if (!repoUrl) {
        return res.status(400).send('Repository URL is required');
    }

    const repoName = repoUrl.split('/').pop()?.replace('.git', '');
    if (!repoName) {
        return res.status(400).send('Invalid repository URL');
    }
    const repoDir = path.join(__dirname, 'repos', repoName);


    try {
        console.log(`Cloning ${repoUrl} to ${repoDir}...`);
        await simpleGit().clone(repoUrl, repoDir);
        console.log('Repository cloned successfully.');
        res.send(`Repository cloned successfully to ${repoDir}`);
    } catch (error) {
        console.error('Failed to clone repository:', error);
        res.status(500).send('Failed to clone repository');
    }
});


app.post('/parse', async (req: Request, res: Response) => {
    const { repoName } = req.body;
    if (!repoName) {
        return res.status(400).send('Repository name is required');
    }

    const repoDir = path.join(__dirname, 'repos', repoName);
    const entryPoint = path.join(repoDir, 'src', 'index.ts'); // Assumption

    try {
        const extractor = new TypescriptExtractor({
            entryPoints: [entryPoint],
        });
        const project = extractor.run();
        res.json(project);
    } catch (error) {
        console.error('Failed to parse repository:', error);
        res.status(500).send('Failed to parse repository');
    }
});

// Basic types for the project structure from @ts-docs/extractor
// These are simplified and based on the documentation
const manualContent: { [key: string]: string } = {};

app.post('/save-content', (req: Request, res: Response) => {
    const { repoName, moduleName, content } = req.body;
    if (!repoName || !moduleName || !content) {
        return res.status(400).send('repoName, moduleName, and content are required');
    }
    const key = `${repoName}/${moduleName}`;
    manualContent[key] = content;
    res.send('Content saved');
});

export interface Project {
    modules: Module[];
}

export interface Module {
    name: string;
    classes: any[];
    interfaces: any[];
    functions: any[];
    // ... and other members
}


export function generateDocsHtml(project: Project, repoName: string): string {
    let html = `
        <!DOCTYPE html>
        <html>
        <head>
            <title>API Documentation</title>
            <style>
                body { font-family: sans-serif; }
                .module { border: 1px solid #ccc; padding: 10px; margin-bottom: 10px; }
                .module-name { font-size: 1.5em; font-weight: bold; }
                .member { margin-left: 20px; }
                .editor { display: none; margin-top: 10px; }
                .manual-content { background-color: #f0f0f0; padding: 10px; margin-top: 10px; }
            </style>
        </head>
        <body>
            <h1>API Documentation for ${repoName}</h1>
            <div id="editor-container" class="editor">
                <textarea id="editor-textarea" rows="10" style="width: 100%;"></textarea>
                <button id="editor-save">Save</button>
                <button id="editor-cancel">Cancel</button>
            </div>
    `;

    if (project.modules) {
        project.modules.forEach(module => {
            const moduleKey = `${repoName}/${module.name}`;
            html += `<div class="module">`;
            html += `<div class="module-name">${module.name} <button class="edit-button" data-module-name="${module.name}">Edit</button></div>`;

            // Manual content display
            html += `<div class="manual-content" id="manual-content-${module.name}">${manualContent[moduleKey] || ''}</div>`;


            if (module.classes) {
                module.classes.forEach(c => {
                    html += `<div class="member"><strong>Class:</strong> ${c.name}</div>`;
                });
            }

            if (module.interfaces) {
                module.interfaces.forEach(i => {
                    html += `<div class="member"><strong>Interface:</strong> ${i.name}</div>`;
                });
            }

            if (module.functions) {
                module.functions.forEach(f => {
                    html += `<div class="member"><strong>Function:</strong> ${f.name}</div>`;
                });
            }


            html += `</div>`;
        });
    }


    html += `
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
                    editorTextarea.value = content;
                    editorContainer.style.display = 'block';
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
                        document.getElementById(\`manual-content-\${moduleName}\`).innerText = content;
                        editorContainer.style.display = 'none';
                    }
                });
            });
        </script>
        </body>
        </html>
    `;

    return html;
}

app.get('/docs/:repoName', (req: Request, res: Response) => {
    const { repoName } = req.params;
    const repoDir = path.join(__dirname, 'repos', repoName);
    const entryPoint = path.join(repoDir, 'src', 'index.ts'); // Assumption

    try {
        const extractor = new TypescriptExtractor({
            entryPoints: [entryPoint],
        });
        const project = extractor.run() as unknown as Project; // Cast to our simplified type
        const html = generateDocsHtml(project, repoName);
        res.send(html);
    } catch (error) {
        console.error('Failed to generate documentation:', error);
        res.status(500).send('Failed to generate documentation');
    }
});

export function generateMockData(typeName: string): any {
    switch (typeName) {
        case 'string':
            return 'mock string';
        case 'number':
            return 123;
        case 'boolean':
            return true;
        default:
            return { message: `mock object for type ${typeName}` };
    }
}

app.all('/mock/:repoName/*', (req: Request, res: Response) => {
    const { repoName } = req.params;
    const requestedEndpoint = req.params[0];

    const repoDir = path.join(__dirname, 'repos', repoName);
    const entryPoint = path.join(repoDir, 'src', 'index.ts'); // Assumption

    try {
        const extractor = new TypescriptExtractor({
            entryPoints: [entryPoint],
        });
        const project = extractor.run() as unknown as Project;

        let targetFunction: any;

        if (project.modules) {
            for (const module of project.modules) {
                if (module.functions) {
                    targetFunction = module.functions.find(f => f.name === requestedEndpoint);
                    if (targetFunction) break;
                }
            }
        }


        if (targetFunction) {
            const returnType = targetFunction.returnType || 'object';
            const mockData = generateMockData(returnType);
            res.json(mockData);
        } else {
            res.status(404).send('Endpoint not found in documentation');
        }

    } catch (error) {
        console.error('Failed to generate mock data:', error);
        res.status(500).send('Failed to generate mock data');
    }
});

app.listen(port, () => {
  console.log(`Server is running at http://localhost:${port}`);
});
