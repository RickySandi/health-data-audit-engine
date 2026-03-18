import { Injectable, signal } from '@angular/core';

export type FilterType = 'none' | 'provenance' | 'quality' | 'anomalies' | 'alerts';

@Injectable({
  providedIn: 'root'
})
export class FilterService {
  selectedFilter = signal<FilterType>('none');

  setFilter(filter: FilterType) {
    this.selectedFilter.set(filter);
  }
}
