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

  // --- Signals de Datos ---
  anomalies = signal<Anomaly[]>([]);

  // --- Signals de Estado/Contadores (Añadidos para resolver el error) ---
  anomaliesCount = signal(0);
  alertsCount = signal(0);
  hasHighSeverity = signal(false);

  ngOnInit() {
    this.fetchAnomalies();
  }

  fetchAnomalies() {
    // Apuntamos al backend en Docker
    this.http.get<any[]>('http://localhost:8000/anomalies').subscribe({
      next: (data) => {
        // 1. Procesar los detalles JSON para la plantilla
        const processed = data.map(item => {
          let parsed;
          try {
            // Manejamos si el backend envía el objeto ya parseado o como string
            parsed = typeof item.details === 'string' ? JSON.parse(item.details) : item.details;
          } catch (e) {
            parsed = { raw: item.details };
          }
          return { ...item, parsedDetails: parsed };
        });

        // 2. Actualizar el listado principal (esto elimina los datos hardcodeados)
        this.anomalies.set(processed);

        // 3. ACTUALIZAR CONTADORES (Sincronización con la UI)
        this.anomaliesCount.set(processed.length);

        // 4. FILTRAR ALERTAS DE INNOVACIÓN (Hidden Falls)
        // Esto busca las anomalías generadas por el cruce de notas de enfermería y sensores
        const sensorConflicts = processed.filter(a => a.category === 'Sensor Conflict');
        this.alertsCount.set(sensorConflicts.length);

        // 5. VERIFICAR SEVERIDAD ALTA
        // Si hay una sola anomalía crítica, activamos el flag de alerta visual
        const hasHigh = processed.some(a =>
          a.severity_level?.toLowerCase() === 'high' ||
          a.severity_level?.toLowerCase() === 'critical'
        );
        this.hasHighSeverity.set(hasHigh);

        console.log(`[Data Sync] Real anomalies loaded: ${processed.length}, Conflicts: ${sensorConflicts.length}`);
      },
      error: (err) => {
        console.error('Error fetching anomalies from backend:', err);
        // Fallback en caso de error de conexión para que la UI no se vea rota
        this.anomaliesCount.set(0);
      }
    });
  }

  updateStatus(anomalyId: number, status: string) {
    this.http.patch(`http://localhost:8000/anomalies/${anomalyId}`, { status }).subscribe({
      next: (updated: any) => {
        // Actualizamos el estado local sin recargar toda la lista
        this.anomalies.update(list =>
          list.map(a => a.id === updated.id ? { ...a, status: updated.status } : a)
        );
      },
      error: (err) => console.error('Error updating status', err)
    });
  }
}