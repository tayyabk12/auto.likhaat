const http = require('http');
const fs = require('fs');
const path = require('path');

const MIME = {
  '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.mp4': 'video/mp4',
  '.webm': 'video/webm', '.vtt': 'text/vtt', '.srt': 'application/x-subrip',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.otf': 'font/otf',
  '.mp3': 'audio/mpeg', '.wav': 'audio/wav'
};

http.createServer((req, res) => {
    let pathname = decodeURIComponent(req.url.split('?')[0]);
    let filePath = path.join(__dirname, pathname);
    if (filePath.endsWith(path.sep) || filePath === __dirname) filePath = path.join(__dirname, 'index.html');
    fs.stat(filePath, (err, stat) => {
        // Try clean URL: /editor → editor.html
        if (err || stat.isDirectory()) {
            const withExt = filePath + '.html';
            if (fs.existsSync(withExt)) {
                filePath = withExt;
            } else {
                res.writeHead(404);
                res.end('Not found');
                return;
            }
        }
        res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' });
        fs.createReadStream(filePath).pipe(res);
    });
}).listen(3000, () => console.log('Kalakar OS running at http://localhost:3000'));
