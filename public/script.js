document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('repo-form');
    const repoUrlInput = document.getElementById('repo-url');
    const loader = document.getElementById('loader');
    const errorMessage = document.getElementById('error-message');

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const repoUrl = repoUrlInput.value;

        // Show loader and hide error message
        loader.classList.remove('hidden');
        errorMessage.classList.add('hidden');

        try {
            // 1. Clone the repository
            const cloneRes = await fetch('/clone', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ repoUrl }),
            });

            if (!cloneRes.ok) {
                throw new Error('Failed to clone repository.');
            }

            const repoName = repoUrl.split('/').pop().replace('.git', '');

            // 2. Parse the code (This is a simplification, in a real app you might want a more robust way to chain these)
            // For now, we assume cloning and parsing are fast enough to do in one flow.
            const parseRes = await fetch('/parse', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ repoName }),
            });

            if (!parseRes.ok) {
                throw new Error('Failed to parse repository.');
            }


            // 3. Redirect to the documentation page
            window.location.href = `/docs/${repoName}`;

        } catch (error) {
            loader.classList.add('hidden');
            errorMessage.textContent = error.message;
            errorMessage.classList.remove('hidden');
        }
    });
});
