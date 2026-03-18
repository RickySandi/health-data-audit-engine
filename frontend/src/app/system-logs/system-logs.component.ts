import { Component, signal, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-system-logs',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './system-logs.component.html'
})
export class SystemLogsComponent implements OnInit {
  private http = inject(HttpClient);
  
  logs = signal<any[]>([]);
  isLoading = signal(true);

  ngOnInit() {
    this.refreshLogs();
  }

  refreshLogs() {
    this.isLoading.set(true);
    this.http.get<any[]>('http://localhost:8000/logs').subscribe({
      next: (data) => {
        this.logs.set(data);
        this.isLoading.set(false);
      },
      error: (err) => {
        console.error('Failed to load logs', err);
        this.isLoading.set(false);
      }
    });
  }
}
