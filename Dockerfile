FROM node:22-alpine

RUN mkdir -p /usr/src/app
WORKDIR /usr/src/app

COPY package.json package-lock.json /usr/src/app/
RUN npm install && npm cache clean --force
COPY . /usr/src/app
RUN npm run build

CMD [ "npm", "start" ]

EXPOSE 8080
