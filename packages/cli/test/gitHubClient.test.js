const { MockGitHubClient } = require('./mocks');

function run({ test, assertEqual, assertTrue, assertFalse, assertThrows }) {
    test('GitHubClient should get repo info', async () => {
        const client = new MockGitHubClient();
        const result = await client.getRepo('owner/repo');
        assertEqual(result.full_name, 'owner/repo', 'Should return repo full name');
        assertEqual(result.default_branch, 'main', 'Default branch should be main');
    });

    test('GitHubClient should get branch', async () => {
        const client = new MockGitHubClient();
        const result = await client.getBranch('owner/repo', 'main');
        assertTrue(result.object !== undefined, 'Should have object');
        assertTrue(result.object.sha !== undefined, 'Should have sha');
    });

    test('GitHubClient should create branch', async () => {
        const client = new MockGitHubClient();
        const result = await client.createBranch('owner/repo', 'feature-branch', 'main');
        assertEqual(result.ref, 'refs/heads/feature-branch', 'Should return new branch ref');
    });

    test('GitHubClient should return null for missing file content', async () => {
        const client = new MockGitHubClient();
        const result = await client.getFileContent('owner/repo', 'missing.txt');
        assertEqual(result, null, 'Should return null for missing file');
    });

    test('GitHubClient should create and retrieve file content', async () => {
        const client = new MockGitHubClient();
        await client.createOrUpdateFile('owner/repo', 'test.md', 'Hello World', 'add file', 'main');

        const result = await client.getFileContent('owner/repo', 'test.md', 'main');
        assertTrue(result !== null, 'Should find the file');
        assertEqual(result.content, 'Hello World', 'Content should match');
    });

    test('GitHubClient should create pull request', async () => {
        const client = new MockGitHubClient();
        const result = await client.createPullRequest(
            'owner/repo',
            'Add feature',
            'feature-branch',
            'main',
            'Description here'
        );
        assertEqual(result.number, 1, 'First PR should be #1');
        assertEqual(result.title, 'Add feature', 'Title should match');
        assertTrue(result.html_url.includes('/pull/1'), 'URL should contain PR number');
        assertEqual(result.body, 'Description here', 'Body should match');
    });

    test('GitHubClient should list pull requests for repo', async () => {
        const client = new MockGitHubClient();
        await client.createPullRequest('owner/repo', 'PR 1', 'branch-a', 'main');
        await client.createPullRequest('owner/repo', 'PR 2', 'branch-b', 'main');

        const prs = await client.listPullRequests('owner/repo');
        assertEqual(prs.length, 2, 'Should list 2 PRs');
    });

    test('GitHubClient should update pull request', async () => {
        const client = new MockGitHubClient();
        const pr = await client.createPullRequest('owner/repo', 'Original', 'branch', 'main');

        await client.updatePullRequest('owner/repo', pr.number, { title: 'Updated' });
        const prs = await client.listPullRequests('owner/repo');
        assertEqual(prs[0].title, 'Updated', 'Title should be updated');
    });

    test('GitHubClient should create tag', async () => {
        const client = new MockGitHubClient();
        const result = await client.createTag('owner/repo', 'v1.0', 'abc123', 'Release 1.0');
        assertEqual(result.ref, 'refs/tags/v1.0', 'Should return tag ref');
        assertEqual(client.tags.length, 1, 'Should have 1 tag stored');
        assertEqual(client.tags[0].tag, 'v1.0', 'Tag name should match');
    });

    test('GitHubClient should increment PR numbers', async () => {
        const client = new MockGitHubClient();
        const pr1 = await client.createPullRequest('owner/repo', 'A', 'b1', 'main');
        const pr2 = await client.createPullRequest('owner/repo', 'B', 'b2', 'main');
        assertEqual(pr1.number, 1, 'First PR should be #1');
        assertEqual(pr2.number, 2, 'Second PR should be #2');
    });

    test('GitHubClient reset should clear all data', async () => {
        const client = new MockGitHubClient();
        await client.createPullRequest('owner/repo', 'PR', 'b', 'main');
        await client.createTag('owner/repo', 'v1', 'abc', 'tag');
        client.reset();
        assertEqual(client.prs.size, 0, 'PRs should be empty after reset');
        assertEqual(client.tags.length, 0, 'Tags should be empty after reset');
    });
}

module.exports = { run };
