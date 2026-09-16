import { NestFactory } from '@nestjs/core';
import { RequestMethod, ValidationPipe } from '@nestjs/common';
import { mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { AppModule } from './app.module';

async function bootstrap() {
  const dbPath =
    process.env.DATABASE_PATH ||
    join(__dirname, '..', 'data', 'mailer.sqlite');
  mkdirSync(dirname(dbPath), { recursive: true });

  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api', {
    exclude: [
      { path: 't/o/:token', method: RequestMethod.GET },
      { path: 't/c/:token', method: RequestMethod.GET },
      { path: 'u/:token', method: RequestMethod.GET },
      { path: 'u/:token', method: RequestMethod.POST },
    ],
  });
  app.enableCors({ origin: true });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );
  const port = Number(process.env.PORT) || 3001;
  await app.listen(port);
  console.log(`Mailer API on http://127.0.0.1:${port}`);
}
bootstrap();
