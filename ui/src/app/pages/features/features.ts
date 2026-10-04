import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

/** Public English reference; independent of session, instance and runtime dictionaries. */
@Component({
  selector: 'app-features',
  imports: [RouterLink],
  templateUrl: './features.html',
  styleUrl: './features.css',
})
export class Features {}
