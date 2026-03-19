import { Component, signal, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';

export interface Anomaly {
  id: number;
  case_id: string;
  category: string;
  severity_level: string;
  status: string;
  details: string; // JSON string
  detected_at: string;
  parsedDetails?: any;
}

@Component({
  selector: 'app-anomaly-explorer',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './anomaly-explorer.component.html',
  styleUrl: './anomaly-explorer.component.scss'
})
export class AnomalyExplorerComponent implements OnInit {
  private http = inject(HttpClient);
  anomalies = signal<Anomaly[]>([]);

  ngOnInit() {
    this.fetchAnomalies();
  }

  fetchAnomalies() {
    this.http.get<Anomaly[]>('http://localhost:8000/anomalies').subscribe({
      next: (data) => {
        // Parse the JSON details immediately for the template
        const processed = data.map(item => {
          try {
            item.parsedDetails = JSON.parse(item.details);
          } catch (e) {
            item.parsedDetails = { raw: item.details };
          }
          return item;
        });
        this.anomalies.set(processed);
      },
      error: (err) => console.error('Error fetching anomalies', err)
    });
  }

  updateStatus(anomalyId: number, status: string) {
    this.http.patch(`http://localhost:8000/anomalies/${anomalyId}`, { status }).subscribe({
      next: (updated: any) => {
        // Update local state without full reload
        this.anomalies.update(list => list.map(a => a.id === updated.id ? { ...a, status: updated.status } : a));
      },
      error: (err) => console.error('Error updating status', err)
    });
  }
}
