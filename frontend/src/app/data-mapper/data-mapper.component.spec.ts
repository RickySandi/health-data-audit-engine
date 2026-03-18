import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DataMapperComponent } from './data-mapper.component';

describe('DataMapperComponent', () => {
  let component: DataMapperComponent;
  let fixture: ComponentFixture<DataMapperComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DataMapperComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(DataMapperComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
