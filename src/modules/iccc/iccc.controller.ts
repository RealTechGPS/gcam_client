import { Body, Controller, Get, Param, Post, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { IcccService } from './iccc.service';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { IcccAuthGuard } from './iccc-auth.guard';

class LogsDto {
    imei!: string;
    from!: string;
    to!: string;
    event?: string;
}

@Controller('iccc')
@UseGuards(IcccAuthGuard)
export class IcccController {
    constructor(
        private readonly icccService: IcccService
    ) {}


    @Get("devices")
    getDevices(){
        return this.icccService.getDevices();
    }

    // @Post('report/garbage_logs')
    // getGarbageLogs(@Body() body:LogsDto){
    //     return this.icccService.getGarbageLogs(body.imei,body.from,body.to)
    // }

    @Post('report/person_logs')
    getPersonLogs(@Body() body:LogsDto) {
        return this.icccService.getMotionLogs(body.imei,body.from,body.to)
    }


    @Post('report/vehicle_logs')
    getAnprLogs(@Body() body:LogsDto){
        return this.icccService.getVehicleDetectionLogs(body.imei,body.from,body.to)
    }

    // Device response event logs (filter by event if provided, e.g. "warning_audio_played")
    @Post('report/device_response_logs')
    getDeviceResponseLogs(@Body() body: LogsDto) {
        return this.icccService.getDeviceResponseLogs(body.imei, body.from, body.to, body.event);
    }

    // Alias for backward compatibility
    @Post('report/warning_logs')
    getWarningLogs(@Body() body: LogsDto) {
        return this.icccService.getDeviceResponseLogs(body.imei, body.from, body.to, body.event || 'warning_audio_played');
    }



    // @Post('audio/upload/:imei')
    // @UseInterceptors(FileInterceptor('file', { storage: memoryStorage() }))
    // uploadDeviceAudio(
    //     @Param('imei')          imei: string,
    //     @UploadedFile()         file: Express.Multer.File,
    // ) {
    //     return this.icccService.uploadDeviceAudio(imei, file);
    // }


    // @Get('audio/default')
    // getDefaultAudios() {
    //     return this.icccService.getDefaultAudios();
    // }

    // @Get('audio/device/:imei')
    // getDeviceAudios(@Param('imei') imei: string) {
    //     return this.icccService.getDeviceAudios(imei);
    // }
}
