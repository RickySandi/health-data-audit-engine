import { Routes } from '@angular/router';
import { DashboardComponent } from './dashboard/dashboard.component';
import { DataMapperComponent } from './data-mapper/data-mapper.component';
import { SystemLogsComponent } from './system-logs/system-logs.component';

export const routes: Routes = [
  { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
  { path: 'dashboard', component: DashboardComponent },
  { path: 'mapper', component: DataMapperComponent },
  { path: 'logs', component: SystemLogsComponent },
];
