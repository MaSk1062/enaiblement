FROM node:24-alpine AS deps
WORKDIR /app
# Copy manifests only, so a source edit does not re-run npm ci.
COPY package.json package-lock.json ./
RUN npm ci

FROM node:24-alpine AS prod-deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM node:24-alpine AS build
WORKDIR /app
# Vite inlines import.meta.env.VITE_* into the CLIENT bundle at build time, so these have to
# exist HERE - a Cloud Run runtime env var is far too late. Without them the deployed login
# page reports Firebase as unconfigured and nobody can sign in.
#
# These are public values: they identify the Firebase project and authorise nothing. They
# ship to every visitor in the JS bundle either way. Access control is in requireUser and
# the Firestore rules.
ARG VITE_FIREBASE_API_KEY
ARG VITE_FIREBASE_AUTH_DOMAIN
ARG VITE_FIREBASE_PROJECT_ID
ENV VITE_FIREBASE_API_KEY=$VITE_FIREBASE_API_KEY \
    VITE_FIREBASE_AUTH_DOMAIN=$VITE_FIREBASE_AUTH_DOMAIN \
    VITE_FIREBASE_PROJECT_ID=$VITE_FIREBASE_PROJECT_ID
COPY . .
COPY --from=deps /app/node_modules ./node_modules
RUN npm run build

FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/build ./build
USER node
# Cloud Run injects PORT (8080) and react-router-serve reads it. Server-side config
# (GCP_PROJECT_ID, FIRESTORE_DATABASE_ID, model ids) comes from Cloud Run env vars, and
# credentials come from the runtime service account via ADC - there is no key in the image.
CMD ["npm", "run", "start"]
