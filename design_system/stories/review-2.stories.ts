import { Component, signal } from "@angular/core";
import { FormControl, ReactiveFormsModule, Validators } from "@angular/forms";
import { type Meta, type StoryObj } from "@storybook/angular";
import { MbField, MbControl } from "../../ui/src/app/design-system/field/field";
import { MbRadioGroup } from "../../ui/src/app/design-system/radio-group/radio-group";
import {
  MbSaveFeedback,
  type SaveState,
} from "../../ui/src/app/design-system/save-feedback/save-feedback";
import { MbButton } from "../../ui/src/app/design-system/button/button";

@Component({
  selector: "mb-sprint-two-demo",
  imports: [
    ReactiveFormsModule,
    MbField,
    MbControl,
    MbRadioGroup,
    MbSaveFeedback,
    MbButton,
  ],
  template: `
    <article class="ds-sheet">
      <h1>Forms that fit together.</h1>
      <p class="ds-intro">
        Sprint 2 · Native controls, consistent labels and useful feedback. This
        sandbox saves only in memory.
      </p>
      <section class="ds-section ds-stack">
        <h2>A label, a control, an explanation</h2>
        <mb-field
          label="Display name"
          hint="Choose the name people see on your profile."
          [error]="nameError()"
        >
          <input
            mbControl
            type="text"
            required
            autocomplete="off"
            [formControl]="displayName"
          />
        </mb-field>
        <mb-save-feedback
          [state]="saveState() === 'error' ? 'idle' : saveState()"
          [message]="saveMessage()"
        />
        <div class="ds-actions">
          <button
            mbButton
            type="button"
            [disabled]="saveState() === 'saving'"
            (click)="save(false)"
          >
            Save successfully
          </button>
          <button
            mbButton
            type="button"
            variant="outline"
            [disabled]="saveState() === 'saving'"
            (click)="save(true)"
          >
            Simulate failed save
          </button>
        </div>
      </section>
      <section class="ds-section ds-stack">
        <h2>Familiar native controls</h2>
        <mb-field label="Daily reading goal" hint="A number between 1 and 100."
          ><input mbControl type="number" min="1" max="100" value="20"
        /></mb-field>
        <mb-field
          label="App password"
          hint="This preview never sends or stores credentials."
          ><input mbControl type="password" autocomplete="new-password"
        /></mb-field>
        <mb-field label="Post visibility"
          ><select mbControl>
            <option>Everyone</option>
            <option>Followers</option>
            <option>Mentioned people</option>
          </select></mb-field
        >
        <mb-field
          label="Profile description"
          hint="Longer text has room to breathe."
        >
          <textarea mbControl rows="3"></textarea>
        </mb-field>
      </section>
      <section class="ds-section">
        <mb-radio-group
          label="Expand content warnings"
          hint="Choose one default for your timeline."
          [options]="options"
          [formControl]="warningPolicy"
        />
      </section>
      <section class="ds-section ds-stack">
        <h2>Narrow layouts and unavailable controls</h2>
        <div class="ds-narrow">
          <mb-field
            label="Standard-Sichtbarkeit für zukünftige Beiträge"
            hint="Diese Einstellung gilt nur für neue Beiträge."
            ><select mbControl>
              <option>Nur bestätigte Follower</option>
              <option>Alle Personen</option>
            </select></mb-field
          >
        </div>
        <mb-field label="Server address" hint="Managed by your server."
          ><input mbControl type="text" value="example.social" disabled
        /></mb-field>
      </section>
    </article>
  `,
})
class SprintTwoDemo {
  readonly displayName = new FormControl("Mawkingbird reader", {
    nonNullable: true,
    validators: [Validators.required],
  });
  readonly warningPolicy = new FormControl("none");
  readonly saveState = signal<SaveState>("idle");
  readonly saveMessage = signal("");
  readonly nameError = signal("");
  private savedName = "Mawkingbird reader";
  readonly options = [
    {
      value: "none",
      label: "Keep warnings collapsed",
      hint: "Reveal each post when you choose to read it.",
    },
    {
      value: "follows",
      label: "Expand posts from people I follow",
      hint: "Warnings from everyone else stay collapsed.",
    },
    {
      value: "shares",
      label:
        "Expand posts from people I follow, including posts shared into my timeline",
      hint: "Explanations align with their labels, without manual offsets.",
    },
  ];

  save(fail: boolean): void {
    if (this.displayName.invalid) {
      this.displayName.markAsTouched();
      this.nameError.set("Enter a display name.");
      this.saveState.set("idle");
      return;
    }
    const submittedName = this.displayName.value;
    this.nameError.set("");
    this.saveState.set("saving");
    this.saveMessage.set("Saving your changes…");
    this.displayName.disable();
    setTimeout(() => {
      if (fail) {
        this.displayName.setValue(this.savedName);
        this.nameError.set(
          "Your change could not be saved. The previous value has been restored.",
        );
        this.saveState.set("error");
      } else {
        this.savedName = submittedName;
        this.saveState.set("saved");
        this.saveMessage.set("Saved ✓");
      }
      this.displayName.enable();
    }, 350);
  }
}

const meta: Meta<SprintTwoDemo> = {
  title: "Start here/Sprint 2 review",
  component: SprintTwoDemo,
};
export default meta;
export const Review: StoryObj<SprintTwoDemo> = {};
