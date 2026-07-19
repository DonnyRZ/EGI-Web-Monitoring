import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { PrismaModule } from "./prisma/prisma.module";
import { AuthModule } from "./modules/auth/auth.module";
import { UsersModule } from "./modules/users/users.module";
import { WebsitesModule } from "./modules/websites/websites.module";
import { MonitoringModule } from "./modules/monitoring/monitoring.module";
import { IncidentsModule } from "./modules/incidents/incidents.module";
import { TicketsModule } from "./modules/tickets/tickets.module";
import { NotificationsModule } from "./modules/notifications/notifications.module";
import { DashboardModule } from "./modules/dashboard/dashboard.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [".env", "../../.env"],
    }),
    PrismaModule,
    AuthModule,
    UsersModule,
    WebsitesModule,
    MonitoringModule,
    IncidentsModule,
    TicketsModule,
    NotificationsModule,
    DashboardModule,
  ],
})
export class AppModule {}
