import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { NgxChartsModule, Color, ScaleType } from '@swimlane/ngx-charts';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink, NgxChartsModule],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss'
})
export class DashboardComponent {
  // Stats Signals
  totalRecords = signal(125430);
  dataQualityIndex = signal(94.2);
  mappingConflicts = signal(124);
  efficiencyGain = signal(1.4);

  // Chart Data
  sourceSystemData = [
    { name: 'Kardio-DB (CSV)', value: 85000 },
    { name: 'Labor-Befunde (PDF)', value: 32000 },
    { name: 'Freetext Notes', value: 8430 }
  ];

  // Chart options
  showXAxis = true;
  showYAxis = true;
  gradient = false;
  showLegend = false;
  showXAxisLabel = true;
  yAxisLabel = 'Source System';
  showYAxisLabel = true;
  xAxisLabel = 'Records Processed';
  colorScheme: Color = {
    domain: ['#005eb8', '#10b981', '#64748b'],
    name: 'custom',
    selectable: true,
    group: ScaleType.Ordinal,
  };

  // Table Data
  recentHarmonizations = signal([
    { id: 'H-0012', source: 'Kardio-DB', records: 450, status: 'Mapped', time: '10 mins ago' },
    { id: 'H-0013', source: 'Labor-Befunde', records: 12, status: 'Low Confidence', time: '1 hour ago' },
    { id: 'H-0014', source: 'Freetext Notes', records: 3, status: 'Manual Review Required', time: '2 hours ago' },
    { id: 'H-0015', source: 'Patient Master', records: 800, status: 'Mapped', time: '5 hours ago' },
    { id: 'H-0016', source: 'Legacy EHR', records: 210, status: 'Mapped', time: '6 hours ago' }
  ]);
}
