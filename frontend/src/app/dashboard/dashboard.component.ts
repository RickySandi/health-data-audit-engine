import { Component, signal, inject, OnInit } from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { RouterLink, Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { NgxChartsModule, Color, ScaleType } from '@swimlane/ngx-charts';
import { FilterService, FilterType } from '../shared/services/filter.service';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink, NgxChartsModule],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
  providers: [DecimalPipe]
})
export class DashboardComponent implements OnInit {
  private router = inject(Router);
  private filterService = inject(FilterService);
  private http = inject(HttpClient);

  isLoading = signal(false);
  isExporting = signal(false);

  // Stats Signals
  totalRecords = signal(0);
  dataQualityIndex = signal(0);
  anomaliesCount = signal(0);
  alertsCount = signal(0);
  hasHighSeverity = signal(false);
  efficiencyGain = signal(1.4);
  uniqueSourceSystems = signal(0);

  // Chart Data (populated dynamically from /dashboard-stats)
  sourceSystemData: { name: string; value: number }[] = [];

  // Data Quality chart — 6 unified schema categories
  dataQualityData: { name: string; value: number }[] = [];

  // Table Data
  recentHarmonizations = signal<{ id: string; source: string; records: number; status: string; time: string }[]>([]);
  dataQualityColorScheme: Color = {
    // One distinct high-contrast brand color per category (6 entries = 6 bars,
    // no cycling, no accidental colour re-use across the chart).
    domain: ['#005eb8', '#10b981', '#6366f1', '#f59e0b', '#ef4444', '#0ea5e9'],
    name: 'quality',
    selectable: true,
    group: ScaleType.Ordinal,
  };

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


  ngOnInit() {
    // Reset global filter back to none when visiting dashboard
    this.filterService.setFilter('none');
    this.fetchDashboardStats();
    this.fetchAnomalies();
  }

  fetchDashboardStats() {
    this.http.get<any>('http://localhost:8000/dashboard-stats').subscribe({
      next: (data) => {
        if (data.total_count != null) {
          this.totalRecords.set(data.total_count);
        }
        if (data.medication_adherence != null && data.medication_adherence > 0) {
          this.dataQualityIndex.set(data.medication_adherence);
        }
        if (data.anomaly_count != null) {
          this.anomaliesCount.set(data.anomaly_count);
        }
        if (data.unique_source_systems != null) {
          this.uniqueSourceSystems.set(data.unique_source_systems);
        }
        if (Array.isArray(data.source_distribution) && data.source_distribution.length > 0) {
          this.sourceSystemData = data.source_distribution;
        }
        if (Array.isArray(data.category_completeness) && data.category_completeness.length > 0) {
          this.dataQualityData = data.category_completeness;
        }
        if (Array.isArray(data.recent_imports)) {
          const now = new Date();
          this.recentHarmonizations.set(
            data.recent_imports.map((r: any) => {
              const diffMs = now.getTime() - new Date(r.imported_at).getTime();
              const diffMins = Math.floor(diffMs / 60000);
              let time: string;
              if (diffMins < 1)       time = 'Just now';
              else if (diffMins < 60) time = `${diffMins} min${diffMins > 1 ? 's' : ''} ago`;
              else {
                const h = Math.floor(diffMins / 60);
                time = `${h} hour${h > 1 ? 's' : ''} ago`;
              }
              return { id: r.id, source: r.source, records: r.records, status: r.status, time };
            })
          );
        }
      },
      error: (err) => console.error('Error fetching dashboard stats', err)
    });
  }

  async exportDashboardToPDF(): Promise<void> {
    const element = document.getElementById('dashboard-content');
    if (!element) return;

    this.isExporting.set(true);

    // Refresh signals so the UI shows the latest data before we capture.
    this.fetchAnomalies();
    this.fetchDashboardStats();
    await new Promise<void>(res => setTimeout(res, 1000));

    // ── Phase 1: override SVG opacity at every level ────────────────────────
    // ngx-charts can leave SVG shapes at partial opacity from its internal
    // hover/animation tracking even when [animations]="false".  html2canvas
    // reads the computed value, so we must force it on three distinct layers:
    //
    //   A. CSS rules  → inject a <style> that wins with !important
    //   B. Inline style attribute → el.style.opacity / fillOpacity
    //   C. SVG presentation attribute → the 'opacity' / 'fill' XML attribute
    //
    // All overrides are saved and restored in finally so the live UI is
    // unchanged after export.

    // A. CSS injection --------------------------------------------------------
    const captureStyle = document.createElement('style');
    captureStyle.id = 'pdf-capture-style';
    captureStyle.textContent = `
      #dashboard-content svg *,
      #dashboard-content ngx-charts-bar-horizontal svg * {
        opacity:        1 !important;
        fill-opacity:   1 !important;
        stroke-opacity: 1 !important;
        animation:      none !important;
        transition:     none !important;
      }
    `;
    document.head.appendChild(captureStyle);

    // B+C. Element-level overrides -------------------------------------------
    type SavedShape = {
      el:           SVGElement;
      inlineOpacity: string;
      fillOpacity:   string;
      attrOpacity:   string | null;
      attrFill:      string | null;
    };
    const savedShapes: SavedShape[] = [];

    element.querySelectorAll<SVGElement>('svg rect, svg path, svg circle, svg ellipse').forEach(el => {
      const attrFill = el.getAttribute('fill');
      savedShapes.push({
        el,
        inlineOpacity: el.style.opacity,
        fillOpacity:   el.style.fillOpacity,
        attrOpacity:   el.getAttribute('opacity'),
        attrFill,
      });

      // Force inline opacity
      el.style.opacity      = '1';
      el.style.fillOpacity  = '1';
      el.removeAttribute('opacity');   // presentation attribute wins over CSS in SVG

      // Convert any rgba() fill to fully-opaque rgb()
      if (attrFill) {
        const m = attrFill.match(/rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)(?:[,\s]+[\d.]+)?\s*\)/);
        if (m) el.setAttribute('fill', `rgb(${m[1]},${m[2]},${m[3]})`);
      }
    });

    // Also kill opacity on group wrappers (ngx-charts animates at the <g> level)
    type SavedGroup = { el: SVGElement; inlineOpacity: string; attrOpacity: string | null };
    const savedGroups: SavedGroup[] = [];

    element.querySelectorAll<SVGElement>('svg g').forEach(g => {
      savedGroups.push({ el: g, inlineOpacity: g.style.opacity, attrOpacity: g.getAttribute('opacity') });
      g.style.opacity = '1';
      g.removeAttribute('opacity');
    });

    // ── Phase 2: capture ────────────────────────────────────────────────────
    let canvas: HTMLCanvasElement | null = null;
    try {
      canvas = await html2canvas(element, {
        scale:           2,
        backgroundColor: '#ffffff',
        useCORS:         true,
        allowTaint:      true,
        logging:         true,
      });
    } catch (err) {
      console.error('[PDF Export] html2canvas error:', err);
      return;
    } finally {
      // ── Phase 3: restore all overridden styles ────────────────────────────
      savedShapes.forEach(({ el, inlineOpacity, fillOpacity, attrOpacity, attrFill }) => {
        el.style.opacity     = inlineOpacity;
        el.style.fillOpacity = fillOpacity;
        if (attrOpacity !== null) el.setAttribute('opacity', attrOpacity);
        if (attrFill    !== null) el.setAttribute('fill', attrFill);
        else                      el.removeAttribute('fill');
      });
      savedGroups.forEach(({ el, inlineOpacity, attrOpacity }) => {
        el.style.opacity = inlineOpacity;
        if (attrOpacity !== null) el.setAttribute('opacity', attrOpacity);
      });
      document.head.removeChild(captureStyle);
      // isExporting is reset after the PDF is saved (or on error via return above)
    }

    // ── Phase 4: build PDF ──────────────────────────────────────────────────
    const pdf     = new jsPDF('p', 'mm', 'a4');
    const pageW   = pdf.internal.pageSize.getWidth();
    const pageH   = pdf.internal.pageSize.getHeight();
    const marginX = 10;
    const headerH = 42;
    const footerH = 12;
    const imgW    = pageW - marginX * 2;

    pdf.setFontSize(16);
    pdf.setTextColor(15, 23, 42);
    pdf.text('Smart Health Data Mapping – Automated Audit Report', marginX, 15);

    pdf.setFontSize(11);
    pdf.setTextColor(100, 116, 139);
    pdf.text('Institution: Stadtspital Zürich', marginX, 22);

    pdf.setFontSize(10);
    pdf.setTextColor(0, 94, 184);
    const srcCount = this.uniqueSourceSystems() || 3;
    pdf.text(
      `Data Origin: ${this.totalRecords().toLocaleString()} records across ${srcCount} source system${srcCount !== 1 ? 's' : ''}`,
      marginX, 29
    );

    const [ar, ag, ab] = this.hasHighSeverity() ? [220, 38, 38] : [249, 115, 22];
    pdf.setTextColor(ar, ag, ab);
    pdf.text(
      `Anomaly Detection: ${this.anomaliesCount()} anomalies detected` +
      (this.hasHighSeverity() ? ' — HIGH SEVERITY' : ''),
      marginX, 36
    );

    const imgData    = canvas.toDataURL('image/png');
    const naturalH   = (canvas.height / canvas.width) * imgW;
    const availableH = pageH - headerH - footerH;
    const imgH       = Math.min(naturalH, availableH);

    pdf.addImage(imgData, 'PNG', marginX, headerH, imgW, imgH);

    pdf.setFontSize(9);
    pdf.setTextColor(148, 163, 184);
    pdf.text(
      `Generated by AI Mapping Engine – ${new Date().toLocaleString()}`,
      marginX, pageH - 5
    );

    pdf.save(`SmartHealth_Mapping_Report_${Date.now()}.pdf`);
    this.isExporting.set(false);
  }

  fetchAnomalies() {
    this.http.get<any[]>('http://localhost:8000/anomalies').subscribe({
      next: (data) => {
        this.anomaliesCount.set(data.length);
        this.hasHighSeverity.set(data.some(a => a.severity_level === 'High' || a.severity_level === 'Critical'));
        this.alertsCount.set(data.filter(a => a.category === 'Sensor Conflict').length);
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
