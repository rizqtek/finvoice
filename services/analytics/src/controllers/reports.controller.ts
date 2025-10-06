import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

@ApiTags('Reports')
@Controller('reports')
export class ReportsController {
  @Get()
  getReports() {
    return {
      message: 'Reports controller - to be implemented'
    };
  }
}