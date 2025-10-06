import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

@ApiTags('Dashboard')
@Controller('dashboard')
export class DashboardController {
  @Get()
  getDashboard() {
    return {
      message: 'Dashboard controller - to be implemented'
    };
  }
}