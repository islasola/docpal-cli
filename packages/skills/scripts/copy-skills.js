const fs = require('fs');
const path = require('path');

const sourceDir = path.resolve(__dirname, '..', '..', '..', 'skills');
const targetDir = path.resolve(__dirname, '..', 'skills');

function copyRecursive(src, dest) {
    if (!fs.existsSync(dest)) {
        fs.mkdirSync(dest, { recursive: true });
    }
    const entries = fs.readdirSync(src, { withFileTypes: true });
    for (const entry of entries) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);
        if (entry.isDirectory()) {
            copyRecursive(srcPath, destPath);
        } else {
            fs.copyFileSync(srcPath, destPath);
        }
    }
}

if (fs.existsSync(sourceDir)) {
    copyRecursive(sourceDir, targetDir);
    console.log(`Copied skills from ${sourceDir} to ${targetDir}`);
} else {
    console.error(`Source skills directory not found: ${sourceDir}`);
    process.exit(1);
}
