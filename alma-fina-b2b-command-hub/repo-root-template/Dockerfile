FROM node:20-alpine

WORKDIR /app

COPY package.json ./
COPY railway.json ./
COPY alma-fina-b2b-command-hub/package*.json ./alma-fina-b2b-command-hub/

RUN npm install \
  && npm --prefix alma-fina-b2b-command-hub install

COPY README-ROOT-DEPLOY.md ./
COPY alma-fina-b2b-command-hub ./alma-fina-b2b-command-hub

ENV NODE_ENV=production

CMD ["npm", "start"]
