/* github-api.js — GitHub Git Trees API wrapper for atomic multi-file commits */

(function () {
  'use strict';

  const API = 'https://api.github.com';

  function headers(token) {
    return {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json'
    };
  }

  async function apiRequest(token, endpoint, opts = {}) {
    const res = await fetch(API + endpoint, {
      ...opts,
      headers: { ...headers(token), ...(opts.headers || {}) }
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`GitHub API ${res.status}: ${body}`);
    }
    return res.json();
  }

  // Get the SHA of the latest commit on a branch
  async function getRef(token, owner, repo, branch = 'main') {
    const data = await apiRequest(token, `/repos/${owner}/${repo}/git/ref/heads/${branch}`);
    return data.object.sha;
  }

  // Get the tree SHA from a commit
  async function getCommit(token, owner, repo, commitSha) {
    return apiRequest(token, `/repos/${owner}/${repo}/git/commits/${commitSha}`);
  }

  // Create a blob (base64 for binary, utf-8 for text)
  async function createBlob(token, owner, repo, content, encoding = 'utf-8') {
    return apiRequest(token, `/repos/${owner}/${repo}/git/blobs`, {
      method: 'POST',
      body: JSON.stringify({ content, encoding })
    });
  }

  // Create a new tree with the given file entries
  async function createTree(token, owner, repo, baseTreeSha, treeEntries) {
    return apiRequest(token, `/repos/${owner}/${repo}/git/trees`, {
      method: 'POST',
      body: JSON.stringify({
        base_tree: baseTreeSha,
        tree: treeEntries
      })
    });
  }

  // Create a commit
  async function createCommitObj(token, owner, repo, message, treeSha, parentSha) {
    return apiRequest(token, `/repos/${owner}/${repo}/git/commits`, {
      method: 'POST',
      body: JSON.stringify({
        message,
        tree: treeSha,
        parents: [parentSha]
      })
    });
  }

  // Fast-forward branch ref to new commit
  async function updateRef(token, owner, repo, branch, commitSha) {
    return apiRequest(token, `/repos/${owner}/${repo}/git/refs/heads/${branch}`, {
      method: 'PATCH',
      body: JSON.stringify({ sha: commitSha })
    });
  }

  // Fetch a file's content from the repo (for reading existing JSON)
  async function getFileContent(token, owner, repo, path, branch = 'main') {
    try {
      const data = await apiRequest(
        token,
        `/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}?ref=${branch}`
      );
      // Content is base64-encoded
      return JSON.parse(atob(data.content.replace(/\n/g, '')));
    } catch (err) {
      if (err.message.includes('404')) return null;
      throw err;
    }
  }

  /**
   * commitFiles — high-level orchestrator for atomic multi-file commits
   *
   * @param {string} token     GitHub PAT
   * @param {string} owner     Repo owner
   * @param {string} repo      Repo name
   * @param {string} message   Commit message
   * @param {Array}  files     Array of { path, content, encoding }
   *                           encoding: 'utf-8' for text, 'base64' for binary
   * @param {function} onProgress  Optional callback(step, message)
   */
  async function commitFiles(token, owner, repo, message, files, onProgress) {
    const progress = onProgress || (() => {});

    // 1. Get current HEAD
    progress('ref', 'Getting current branch...');
    const headSha = await getRef(token, owner, repo);
    const headCommit = await getCommit(token, owner, repo, headSha);
    const baseTreeSha = headCommit.tree.sha;

    // 2. Create blobs for each file
    progress('blobs', `Creating ${files.length} file(s)...`);
    const treeEntries = [];
    for (const file of files) {
      const blob = await createBlob(token, owner, repo, file.content, file.encoding || 'utf-8');
      treeEntries.push({
        path: file.path,
        mode: '100644',
        type: 'blob',
        sha: blob.sha
      });
    }

    // 3. Create tree
    progress('tree', 'Building commit tree...');
    const newTree = await createTree(token, owner, repo, baseTreeSha, treeEntries);

    // 4. Create commit
    progress('commit', 'Creating commit...');
    const newCommit = await createCommitObj(token, owner, repo, message, newTree.sha, headSha);

    // 5. Update ref
    progress('update', 'Updating branch...');
    await updateRef(token, owner, repo, 'main', newCommit.sha);

    progress('done', 'Committed successfully!');
    return newCommit;
  }

  window.GitHubAPI = {
    getRef,
    getCommit,
    createBlob,
    createTree,
    createCommit: createCommitObj,
    updateRef,
    getFileContent,
    commitFiles
  };
})();
