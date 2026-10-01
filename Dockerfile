FROM node:24-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY src ./src
# a fresh named volume copies ownership from this dir; without it /data is root-owned
RUN mkdir /data && chown node:node /data
USER node
EXPOSE 4000
CMD ["node", "src/app.js"]
