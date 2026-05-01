FROM nginx:alpine

# Remove default config
RUN rm /etc/nginx/conf.d/default.conf

# Copy custom config
COPY nginx.conf /etc/nginx/nginx.conf

# Copy app files
COPY . /usr/share/nginx/html

EXPOSE 8080

CMD ["nginx", "-g", "daemon off;"]FROM nginx:alpine

COPY . /usr/share/nginx/html

EXPOSE 8080

CMD ["nginx", "-g", "daemon off;"]
