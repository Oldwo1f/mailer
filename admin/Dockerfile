FROM node:22-alpine AS builder

WORKDIR /app

ARG NUXT_PUBLIC_API_BASE=https://mailing.aito-flow.com/api
ARG NUXT_PUBLIC_PRIMEUI_LICENSE=

ENV NUXT_PUBLIC_API_BASE=$NUXT_PUBLIC_API_BASE
ENV NUXT_PUBLIC_PRIMEUI_LICENSE=$NUXT_PUBLIC_PRIMEUI_LICENSE

COPY admin/package*.json ./
RUN npm install

COPY admin/ ./
RUN npm run build

FROM node:22-alpine AS production

WORKDIR /app

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000

COPY --from=builder /app/.output ./.output

EXPOSE 3000

CMD ["node", ".output/server/index.mjs"]
