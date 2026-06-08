FROM node:22-alpine AS build_image
WORKDIR /app
RUN apk add --no-cache python3 build-base
ADD package.json pnpm-lock.yaml /app/
RUN npm install -g pnpm
RUN pnpm install --ignore-scripts
COPY . /app/
RUN pnpm run build
RUN pnpm prune --prod

# Now we run the app
FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build_image /app ./
CMD ["npm", "run", "start"]
