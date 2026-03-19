import http from 'node:http';
import vm from 'node:vm';

// First, get the list of deps from the main page load chain
const depFiles = [
  '/node_modules/.vite/deps/chunk-BoAXSpZd.js',
  '/node_modules/.vite/deps/react.js',
  '/node_modules/.vite/deps/react-dom_client.js',
  '/node_modules/.vite/deps/react-router-dom.js',
  '/node_modules/.vite/deps/react_jsx-dev-runtime.js',
  '/node_modules/.vite/deps/react_jsx-runtime.js',
  '/node_modules/.vite/deps/react-dom.js',
  '/node_modules/.vite/deps/socket__io-client.js',
  '/node_modules/.vite/deps/zod.js',
];

function fetchFile(url) {
  return new Promise((resolve, reject) => {
    http.get('http://localhost:5173' + url, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

async function checkAll() {
  for (const f of depFiles) {
    try {
      const code = await fetchFile(f);
      if (!code || code.length < 10) {
        console.log('EMPTY/SMALL: ' + f);
        continue;
      }
      try {
        new vm.SourceTextModule(code, { identifier: f });
        console.log('OK: ' + f + ' (' + code.length + ' bytes)');
      } catch (e) {
        console.log('SYNTAX ERROR in ' + f + ': ' + e.message);
        // Try to find the problematic line
        if (e.stack) {
          const lineMatch = e.stack.match(/:(\d+)(?::(\d+))?/);
          if (lineMatch) {
            const lineNum = parseInt(lineMatch[1]);
            const colNum = lineMatch[2] ? parseInt(lineMatch[2]) : 0;
            const lines = code.split('\n');
            const start = Math.max(0, lineNum - 3);
            const end = Math.min(lines.length, lineNum + 2);
            console.log('  Around line ' + lineNum + ', col ' + colNum + ':');
            for (let i = start; i < end; i++) {
              const marker = i === lineNum - 1 ? '>>>' : '   ';
              console.log(marker + ' ' + (i+1) + ': ' + lines[i]?.substring(0, 300));
            }
          }
        }
      }
    } catch (e) {
      console.log('FETCH ERROR: ' + f + ' - ' + e.message);
    }
  }
}

checkAll();
