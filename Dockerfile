FROM nginx:1.27-alpine

ARG BUILD_COMMIT=unknown

COPY index.html /usr/share/nginx/html/index.html
COPY timeline.js /usr/share/nginx/html/timeline.js
COPY nginx.conf /etc/nginx/conf.d/default.conf
RUN printf '{"commit":"%s"}\n' "${BUILD_COMMIT}" > /usr/share/nginx/html/build.json
