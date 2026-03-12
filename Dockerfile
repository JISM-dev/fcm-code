FROM node:21.7.2 AS builder
WORKDIR /usr/src/app

COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:21.7.2-alpine

ENV TZ=Asia/Seoul

RUN apk add --no-cache tzdata \
    && cp /usr/share/zoneinfo/${TZ} /etc/localtime \
    && echo "${TZ}" > /etc/timezone \
    && apk del tzdata      # 용량 절약을 위해 삭제(선택)

WORKDIR /usr/src/app

COPY --from=builder /usr/src/app/dist ./dist
COPY package*.json ./
RUN npm ci --only=production

EXPOSE 3000
CMD ["npm", "run", "start:prod"]
