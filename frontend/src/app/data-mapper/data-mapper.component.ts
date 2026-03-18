import { Component, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';

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
export class DataMapperComponent {
  isDragging = signal(false);
  uploadedFiles = signal<UploadedFile[]>([]);
  
  // Mapping Modal State
  isMappingModalOpen = signal(false);
  currentMappingFile = signal<string | null>(null);
  currentMappingFields = signal<MappingField[]>([]);

  // Derived state
  hasFiles = computed(() => this.uploadedFiles().length > 0);

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
      progress: 0,
      status: 'processing' as const
    }));
    
    this.uploadedFiles.update(curr => [...curr, ...newFiles]);

    // Simulate progress
    newFiles.forEach(file => this.simulateProcessing(file.id));
  }

  private simulateProcessing(id: string) {
    let progress = 0;
    const interval = setInterval(() => {
      progress += Math.random() * 20;
      if (progress >= 100) {
        progress = 100;
        clearInterval(interval);
        this.updateFileStatus(id, 100, 'done');
      } else {
        this.updateFileStatus(id, progress, 'processing');
      }
    }, 500);
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
