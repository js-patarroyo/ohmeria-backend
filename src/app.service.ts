import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getStatus() {
    return {
      name: 'Ohmeria API',
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  }
}
