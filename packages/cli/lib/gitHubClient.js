const fetch = require('node-fetch');

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_API = 'https://api.github.com';

class GitHubClient {
    constructor() {
        this.token = GITHUB_TOKEN;
    }

    headers() {
        return {
            'Authorization': `token ${this.token}`,
            'Accept': 'application/vnd.github.v3+json',
            'Content-Type': 'application/json',
            'User-Agent': 'docpal-cli'
        };
    }

    async request(method, path, body) {
        const url = `${GITHUB_API}${path}`;
        const res = await fetch(url, {
            method,
            headers: this.headers(),
            ...(body ? { body: JSON.stringify(body) } : {})
        });

        if (!res.ok) {
            const error = await res.text();
            throw new Error(`GitHub API error (${res.status}): ${error}`);
        }

        // Some endpoints return 204 No Content
        if (res.status === 204) {
            return null;
        }

        return res.json();
    }

    async getRepo(repo) {
        return this.request('GET', `/repos/${repo}`);
    }

    async getBranch(repo, branch) {
        return this.request('GET', `/repos/${repo}/git/refs/heads/${branch}`);
    }

    async createBranch(repo, newBranch, fromBranch) {
        const baseRef = await this.getBranch(repo, fromBranch);
        return this.request('POST', `/repos/${repo}/git/refs`, {
            ref: `refs/heads/${newBranch}`,
            sha: baseRef.object.sha
        });
    }

    async getFileContent(repo, path, ref = 'main') {
        try {
            const data = await this.request('GET', `/repos/${repo}/contents/${path}?ref=${ref}`);
            return {
                content: Buffer.from(data.content, 'base64').toString('utf8'),
                sha: data.sha
            };
        } catch (err) {
            if (err.message.includes('404')) {
                return null;
            }
            throw err;
        }
    }

    async createOrUpdateFile(repo, path, content, message, branch, sha = null) {
        const body = {
            message,
            content: Buffer.from(content).toString('base64'),
            branch
        };
        if (sha) {
            body.sha = sha;
        }
        return this.request('PUT', `/repos/${repo}/contents/${path}`, body);
    }

    async deleteFile(repo, path, message, branch, sha) {
        return this.request('DELETE', `/repos/${repo}/contents/${path}`, {
            message,
            sha,
            branch
        });
    }

    async createPullRequest(repo, title, head, base, body = '') {
        return this.request('POST', `/repos/${repo}/pulls`, {
            title,
            head,
            base,
            body
        });
    }

    async listPullRequests(repo, options = {}) {
        const params = new URLSearchParams();
        if (options.state) params.append('state', options.state);
        if (options.head) params.append('head', options.head);
        if (options.base) params.append('base', options.base);
        if (options.perPage) params.append('per_page', options.perPage);

        const query = params.toString() ? `?${params.toString()}` : '';
        return this.request('GET', `/repos/${repo}/pulls${query}`);
    }

    async updatePullRequest(repo, prNumber, body) {
        return this.request('PATCH', `/repos/${repo}/pulls/${prNumber}`, body);
    }

    async createTag(repo, tag, sha, message) {
        // Create tag object
        const tagObj = await this.request('POST', `/repos/${repo}/git/tags`, {
            tag,
            message,
            object: sha,
            type: 'commit'
        });

        // Create reference
        return this.request('POST', `/repos/${repo}/git/refs`, {
            ref: `refs/tags/${tag}`,
            sha: tagObj.sha
        });
    }

    async listMergedPullRequests(repo, since, options = {}) {
        const params = new URLSearchParams();
        params.append('state', 'closed');
        params.append('sort', 'updated');
        params.append('direction', 'desc');
        if (options.perPage) params.append('per_page', options.perPage);
        if (options.page) params.append('page', options.page);

        const query = params.toString();
        const prs = await this.request('GET', `/repos/${repo}/pulls?${query}`);

        // Filter by merge date
        const sinceDate = new Date(since);
        return prs.filter(pr => pr.merged_at && new Date(pr.merged_at) >= sinceDate);
    }

    async listPullRequestFiles(repo, prNumber) {
        return this.request('GET', `/repos/${repo}/pulls/${prNumber}/files`);
    }

    async getCommit(repo, sha) {
        return this.request('GET', `/repos/${repo}/git/commits/${sha}`);
    }
}

module.exports = new GitHubClient();
