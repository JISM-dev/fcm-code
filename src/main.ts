import { NestFactory } from '@nestjs/core';
import * as admin from 'firebase-admin';
import { AppModule } from './app.module';

const getRequiredEnv = (key: string): string => {
  const value = process.env[key];
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
};

async function bootstrap() {
  const serviceAccount = {
    type: getRequiredEnv('FIREBASE_TYPE'),
    projectId: getRequiredEnv('FIREBASE_PROJECT_ID'),
    privateKeyId: getRequiredEnv('FIREBASE_PRIVATE_KEY_ID'),
    privateKey: getRequiredEnv('FIREBASE_PRIVATE_KEY').replace(/\\n/g, '\n'),
    clientEmail: getRequiredEnv('FIREBASE_CLIENT_EMAIL'),
    clientId: getRequiredEnv('FIREBASE_CLIENT_ID'),
    authUri: getRequiredEnv('FIREBASE_AUTH_URI'),
    tokenUri: getRequiredEnv('FIREBASE_TOKEN_URI'),
    authProviderX509CertUrl: getRequiredEnv(
      'FIREBASE_AUTH_PROVIDER_X509_CERT_URL',
    ),
    clientX509CertUrl: getRequiredEnv('FIREBASE_CLIENT_X509_CERT_URL'),
  };

  if (admin.apps.length === 0) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount as admin.ServiceAccount),
    });
  }

  const app = await NestFactory.create(AppModule);
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
