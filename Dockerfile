FROM node:20-alpine AS build
WORKDIR /app
COPY package.json ./
RUN npm install --omit=optional
COPY tsconfig.json tsconfig.build.json nest-cli.json ./
COPY src ./src
RUN npx nest build

FROM node:20-alpine
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev --omit=optional
COPY --from=build /app/dist ./dist
EXPOSE 3000
CMD ["node", "dist/main.js"]
