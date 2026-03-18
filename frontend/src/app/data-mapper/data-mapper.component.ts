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

  isDragging = signal(false);
  uploadedFiles = signal<UploadedFile[]>([]);
  
  // Mapping Modal State
  isMappingModalOpen = signal(false);
  currentMappingFile = signal<string | null>(null);
  currentMappingFields = signal<MappingField[]>([]);

  // Derived state
  hasFiles = computed(() => this.uploadedFiles().length > 0);

  // Mock data for contextual drill-down views
  provenanceData = [
    { field: 'Blood Pressure', source: 'Kardio-DB CSV', time: '2 mins ago' },
    { field: 'Heart Rate', source: 'Kardio-DB CSV', time: '2 mins ago' },
    { field: 'Lab Result - HgB', source: 'Labor-Befunde (PDF)', time: '1 hr ago' },
    { field: 'Patient Name', source: 'EPA API', time: '1 hr ago' }
  ];

  qualityData = [
    { rowId: 'R-7489', field: 'date_of_birth', value: 'NULL', issue: 'Missing Date' },
    { rowId: 'R-7490', field: 'epa_code', value: 'unknow', issue: 'Unrecognized Format' },
    { rowId: 'R-7501', field: 'SID_value', value: 'Missing', issue: 'Empty Lab Value' }
  ];

  anomalyData = [
    { rowId: 'K-0021', patient: 'P-992', metric: 'Pulse', value: '210', expected: '60-100', status: 'Critical High' },
    { rowId: 'K-0025', patient: 'P-114', metric: 'SpO2', value: '82%', expected: '>95%', status: 'Critical Low' },
    { rowId: 'L-8392', patient: 'P-119', metric: 'Mobility Score', value: '5', expected: '1-4', status: 'Out of Range' }
  ];

  ngOnInit() {
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

  private http = inject(HttpClient);
  private router = inject(Router);

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

    // Send real request to backend
    files.forEach((file, index) => {
      const id = newFiles[index].id;
      const formData = new FormData();
      formData.append('file', file);

      this.http.post('http://localhost:8000/map-data', formData).subscribe({
        next: (res) => {
          this.updateFileStatus(id, 100, 'done');
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
    // Mock mapping data
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
