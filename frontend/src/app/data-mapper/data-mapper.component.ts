import { Component, signal, computed, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FilterService } from '../shared/services/filter.service';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';

interface UploadedFile {
  id: string;
  name: string;
  type: string;
  size: string;
  progress: number;
  status: 'processing' | 'done' | 'error';
}

interface MappingField {
  sourceField: string;
  sourceValue: string;
  targetField: string;
  confidence: number;
}

@Component({
  selector: 'app-data-mapper',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './data-mapper.component.html',
  styleUrl: './data-mapper.component.scss'
})
export class DataMapperComponent implements OnInit {
  filterService = inject(FilterService);
  currentFilter = this.filterService.selectedFilter;

  private http = inject(HttpClient);
  private router = inject(Router);

  isDragging = signal(false);
  uploadedFiles = signal<UploadedFile[]>([]);

  // Mapping Modal State
  isMappingModalOpen = signal(false);
  currentMappingFile = signal<string | null>(null);
  currentMappingFields = signal<MappingField[]>([]);

  // Derived state
  hasFiles = computed(() => this.uploadedFiles().length > 0);

  // Live data signals — populated from the backend on init and after each upload
  provenanceData  = signal<{ field: string; source: string; time: string }[]>([]);
  qualityData     = signal<{ rowId: string; field: string; value: string; issue: string }[]>([]);
  anomalyData     = signal<{ rowId: string; patient: string; metric: string; value: string; expected: string; status: string }[]>([]);
  sensorConflicts = signal<any[]>([]);

  ngOnInit() {
    this.refreshDashboardData();
    if (this.currentFilter() === 'alerts') {
      this.openMappingEditor({
        id: 'A-100',
        name: 'Mapping Error - Free-text report #492',
        type: 'CSV',
        size: '12 KB',
        progress: 100,
        status: 'done'
      });
    }
  }

  private refreshDashboardData() {
    const now = new Date();

    // ── Anomalies → anomalyData, qualityData, sensorConflicts ──────────────
    this.http.get<any[]>('http://localhost:8000/anomalies').subscribe({
      next: (data) => {
        const clinical: any[] = [];
        const missing:  any[] = [];

        for (const a of data) {
          let parsed: any = {};
          try { parsed = JSON.parse(a.details || '{}'); } catch { /* non-JSON details */ }

          if (a.category === 'Missing Data') {
            missing.push({
              rowId: a.case_id || `R-${a.id}`,
              field: parsed.missing_field || parsed.field || 'Unknown Field',
              value: parsed.raw_value   || parsed.value  || 'NULL',
              issue: parsed.message     || a.category,
            });
          } else if (a.category !== 'Sensor Conflict') {
            clinical.push({
              rowId:    a.case_id || `A-${a.id}`,
              patient:  a.case_id || 'Unknown',
              metric:   parsed.parameter || parsed.metric || parsed.test_name || a.category,
              value:    String(parsed.value ?? parsed.result_value ?? '—'),
              expected: parsed.ref_low != null && parsed.ref_high != null
                          ? `${parsed.ref_low}–${parsed.ref_high}`
                          : (parsed.expected ?? '—'),
              status:   a.severity_level,
            });
          }
        }

        this.anomalyData.set(clinical);
        this.qualityData.set(missing);
        this.sensorConflicts.set(data.filter(a => a.category === 'Sensor Conflict'));
      },
      error: (err) => console.error('Error fetching anomalies', err)
    });

    // ── Logs → provenanceData ───────────────────────────────────────────────
    this.http.get<any[]>('http://localhost:8000/logs').subscribe({
      next: (logs) => {
        const provenance = logs
          .filter(l => l.filename && l.filename !== 'N/A')
          .slice(0, 10)
          .map(l => {
            const diffMs   = now.getTime() - new Date(l.timestamp).getTime();
            const diffMins = Math.floor(diffMs / 60000);
            let time: string;
            if (diffMins < 1)       time = 'Just now';
            else if (diffMins < 60) time = `${diffMins} min${diffMins > 1 ? 's' : ''} ago`;
            else {
              const h = Math.floor(diffMins / 60);
              time = `${h} hour${h > 1 ? 's' : ''} ago`;
            }

            const fn = (l.filename || '').toLowerCase();
            let source = 'Unknown System';
            if (fn.includes('lab') || fn.includes('synth_lab')) source = 'Labor-Befunde (PDF)';
            else if (fn.includes('nursing') || fn.includes('daily_report')) source = 'Freetext Notes';
            else if (fn.includes('medication') || fn.includes('medic')) source = 'Kardio-DB (CSV)';
            else if (fn.includes('motion') || fn.includes('fall') || fn.includes('device')) source = 'Device Sensor Feed';
            else source = 'Kardio-DB (CSV)';

            return { field: l.filename, source, time };
          });

        this.provenanceData.set(provenance);
      },
      error: (err) => console.error('Error fetching logs', err)
    });
  }

  resetFilter() {
    this.filterService.setFilter('none');
  }

  onDragOver(event: DragEvent) {
    event.preventDefault();
    this.isDragging.set(true);
  }

  onDragLeave(event: DragEvent) {
    event.preventDefault();
    this.isDragging.set(false);
  }

  onDrop(event: DragEvent) {
    event.preventDefault();
    this.isDragging.set(false);
    if (event.dataTransfer?.files) {
      this.handleFiles(Array.from(event.dataTransfer.files));
    }
  }

  onFileSelected(event: any) {
    if (event.target.files) {
      this.handleFiles(Array.from(event.target.files));
    }
  }

  private handleFiles(files: File[]) {
    const newFiles = files.map(f => ({
      id: Math.random().toString(36).substring(7),
      name: f.name,
      type: f.name.endsWith('.csv') ? 'CSV' : f.name.endsWith('.pdf') ? 'PDF' : 'TXT',
      size: (f.size / 1024).toFixed(1) + ' KB',
      progress: 50,
      status: 'processing' as const
    }));

    this.uploadedFiles.update(curr => [...curr, ...newFiles]);

    files.forEach((file, index) => {
      const id = newFiles[index].id;
      const formData = new FormData();
      formData.append('file', file);

      this.http.post('http://localhost:8000/map-data', formData).subscribe({
        next: () => {
          this.updateFileStatus(id, 100, 'done');
          this.refreshDashboardData();
          this.router.navigate(['/logs']);
        },
        error: (err) => {
          console.error(err);
          this.updateFileStatus(id, 0, 'error');
        }
      });
    });
  }

  private updateFileStatus(id: string, progress: number, status: 'processing' | 'done' | 'error') {
    this.uploadedFiles.update(files =>
      files.map(f => f.id === id ? { ...f, progress, status } : f)
    );
  }

  openMappingEditor(fileData: UploadedFile) {
    this.currentMappingFile.set(fileData.name);
    this.currentMappingFields.set([
      { sourceField: 'Patient_Name', sourceValue: 'John Doe', targetField: 'first_name', confidence: 95 },
      { sourceField: 'DOB', sourceValue: '1980-05-12', targetField: 'date_of_birth', confidence: 98 },
      { sourceField: 'Notes', sourceValue: 'Hypertension, elevated HR', targetField: 'medical_history_notes', confidence: 85 },
      { sourceField: 'epa_code', sourceValue: 'E-002', targetField: 'none', confidence: 45 },
    ]);
    this.isMappingModalOpen.set(true);
  }

  closeMappingEditor() {
    this.isMappingModalOpen.set(false);
    this.currentMappingFile.set(null);
  }

  saveMapping() {
    this.closeMappingEditor();
  }
}
