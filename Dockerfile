FROM nginx:1.27-alpine

COPY index.html /usr/share/nginx/html/index.html
COPY timeline.js /usr/share/nginx/html/timeline.js
