import { Component, signal, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute, RouterLink } from '@angular/router';

@Component({
  selector: 'app-quality-audit',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <div class="space-y-6">
      <div class="flex items-center justify-between">
        <h1 class="text-2xl font-bold text-gray-900">Quality Audit (Missing Data)</h1>
        <button routerLink="/dashboard" class="bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium shadow-sm flex items-center gap-2">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"></path></svg>
          Back to Dashboard
        </button>
      </div>

      <div class="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        @if (isLoading()) {
          <div class="animate-pulse space-y-4">
            <div class="h-12 bg-gray-200 rounded w-full"></div>
            <div class="h-12 bg-gray-100 rounded w-full"></div>
            <div class="h-12 bg-gray-100 rounded w-full"></div>
          </div>
        } @else {
          <div class="p-4 bg-orange-50 border border-orange-100 rounded-lg flex items-start gap-4 mb-6">
            <svg class="w-5 h-5 text-orange-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
            <p class="text-sm text-orange-800">These <strong>{{auditRecords().length}} records</strong> have been flagged for containing missing or incomplete data under the currently applied filter.</p>
          </div>
          
          <div class="overflow-x-auto">
            <table class="w-full text-left text-sm text-gray-600">
              <thead class="text-xs uppercase bg-gray-50 text-gray-500 border-b border-gray-100">
                <tr>
                  <th class="px-4 py-3 font-semibold">Case ID</th>
                  <th class="px-4 py-3 font-semibold">Missing Field</th>
                  <th class="px-4 py-3 font-semibold">Source System</th>
                  <th class="px-4 py-3 font-semibold">Issue</th>
                  <th class="px-4 py-3 font-semibold text-right">Action</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-100">
                @for (item of auditRecords(); track item.case_id) {
                  <tr class="hover:bg-gray-50 transition-colors">
                    <td class="px-4 py-3 font-mono text-xs text-gray-500">{{item.case_id}}</td>
                    <td class="px-4 py-3 font-medium text-gray-900">{{item.missing_field}}</td>
                    <td class="px-4 py-3"><span class="px-2.5 py-1 text-xs font-medium bg-blue-50 text-med-blue rounded-full">{{item.source_system}}</span></td>
                    <td class="px-4 py-3 font-semibold text-alert-red">{{item.issue}}</td>
                    <td class="px-4 py-3 text-right">
                      <button class="text-med-blue font-medium text-xs hover:bg-blue-50 bg-white border border-gray-200 px-3 py-1.5 rounded shadow-sm transition-colors">Manual Override</button>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }
      </div>
    </div>
  `
})
export class QualityAuditComponent implements OnInit {
  private http = inject(HttpClient);
  private route = inject(ActivatedRoute);

  auditRecords = signal<any[]>([]);
  isLoading = signal(true);

  ngOnInit() {
    this.route.queryParams.subscribe(params => {
      const filter = params['filter'] || '';
      
      this.http.get<any[]>(`http://localhost:8000/quality-audit?filter=${filter}`)
        .subscribe({
          next: (data) => {
            this.auditRecords.set(data);
            this.isLoading.set(false);
          },
          error: (err) => {
            console.error('Error fetching quality audit', err);
            this.isLoading.set(false);
          }
        });
    });
  }
}
