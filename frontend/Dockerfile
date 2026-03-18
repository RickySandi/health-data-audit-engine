# Stage 1: Build the Angular application
FROM node:22-alpine AS build

WORKDIR /app
COPY package*.json ./
# Use legacy peer deps due to UI library peer dependency quirks
RUN npm install --legacy-peer-deps

COPY . .
RUN npm run build --configuration=production

# Stage 2: Serve the application with Nginx
FROM nginx:alpine

# Remove default nginx static assets
RUN rm -rf /usr/share/nginx/html/*

# Copy built assets from builder (Handles both Angular <17 and >=17 outputs)
COPY --from=build /app/dist/frontend /tmp/frontend
RUN cp -r /tmp/frontend/browser/* /usr/share/nginx/html/ 2>/dev/null || cp -r /tmp/frontend/* /usr/share/nginx/html/

# Replace default Nginx config
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
