import { Component, signal, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { NgxChartsModule, Color, ScaleType } from '@swimlane/ngx-charts';
import { FilterService, FilterType } from '../shared/services/filter.service';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink, NgxChartsModule],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss'
})
export class DashboardComponent implements OnInit {
  private router = inject(Router);
  private filterService = inject(FilterService);
  private http = inject(HttpClient);

  isLoading = signal(false);

  // Stats Signals
  totalRecords = signal(125430);
  dataQualityIndex = signal(94.2);
  anomaliesCount = signal(0);
  hasHighSeverity = signal(false);
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

  ngOnInit() {
    // Reset global filter back to none when visiting dashboard
    this.filterService.setFilter('none');
    this.fetchAnomalies();
  }

  fetchAnomalies() {
    this.http.get<any[]>('http://localhost:8000/anomalies').subscribe({
      next: (data) => {
        this.anomaliesCount.set(data.length);
        this.hasHighSeverity.set(data.some(a => a.severity_level === 'High' || a.severity_level === 'Critical'));
      },
      error: (err) => console.error('Error fetching anomalies', err)
    });
  }

  navigateToExplorer() {
    this.router.navigate(['/anomaly-explorer']);
  }

  navigateToMapper(filter: FilterType) {
    this.isLoading.set(true);
    // Visual feedback: Simulate backend processing for 600ms
    setTimeout(() => {
      this.isLoading.set(false);
      
      if (filter === 'quality') {
        this.router.navigate(['/audit'], { queryParams: { filter: 'missing' } });
      } else {
        this.filterService.setFilter(filter);
        this.router.navigate(['/mapper']);
      }
    }, 600);
  }
}
