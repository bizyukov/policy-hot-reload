import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { join } from 'path';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.GRPC,
    options: {
      package: 'pdp',
      protoPath: join(__dirname, 'proto/pdp.proto'),
      url: '0.0.0.0:50050',
    },
  });

  await app.startAllMicroservices();
  await app.listen(3001);
  console.log('pdp: REST :3001 (версии политик), gRPC :50050');
}
bootstrap();