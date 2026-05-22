'use client';

import { Accordion as AccordionPrimitive } from '@base-ui/react/accordion';
import { CaretDownIcon, CaretUpIcon } from '@phosphor-icons/react';

import { cn } from '@/lib/tailwind';

/**
 * Root container for a vertical stack of collapsible {@link AccordionItem}s.
 *
 * @param props Forwarded to the underlying Base UI Accordion root. Set
 *   `multiple` to allow more than one item open at a time (defaults to
 *   single-open); pass `value`/`defaultValue` to control open state.
 */
function Accordion({ className, ...props }: AccordionPrimitive.Root.Props) {
  return (
    <AccordionPrimitive.Root
      className={cn('flex w-full flex-col', className)}
      data-slot="accordion"
      {...props}
    />
  );
}

/**
 * A single accordion entry — pair an {@link AccordionTrigger} with an
 * {@link AccordionContent} inside.
 *
 * @param props Forwarded to the underlying Base UI Accordion item, including
 *   `value` for controlled open state.
 */
function AccordionItem({ className, ...props }: AccordionPrimitive.Item.Props) {
  return (
    <AccordionPrimitive.Item
      className={cn('not-last:border-b', className)}
      data-slot="accordion-item"
      {...props}
    />
  );
}

/**
 * Semantic heading wrapper for an {@link AccordionItem}. Use this when you
 * want an item row that shares the accordion's heading structure (and thus its
 * base typography) without a collapsible trigger — for example, a plain
 * navigation link that should sit visually alongside accordion items.
 *
 * @param props Forwarded to the underlying Base UI Accordion header.
 */
function AccordionHeader({
  className,
  ...props
}: AccordionPrimitive.Header.Props) {
  return (
    <AccordionPrimitive.Header
      className={cn('flex', className)}
      data-slot="accordion-header"
      {...props}
    />
  );
}

/**
 * Clickable header that toggles its sibling {@link AccordionContent}.
 * Renders chevron icons that reflect the open/closed state.
 *
 * @param props Forwarded to the underlying Base UI Accordion trigger.
 */
function AccordionTrigger({
  className,
  children,
  ...props
}: AccordionPrimitive.Trigger.Props) {
  return (
    <AccordionPrimitive.Header className="flex">
      <AccordionPrimitive.Trigger
        className={cn(
          'group/accordion-trigger focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:after:border-ring **:data-[slot=accordion-trigger-icon]:text-muted-foreground relative flex flex-1 items-start justify-between rounded-lg border border-transparent py-2.5 text-left text-sm font-medium transition-all outline-none hover:underline focus-visible:ring-3 aria-disabled:pointer-events-none aria-disabled:opacity-50 **:data-[slot=accordion-trigger-icon]:ml-auto **:data-[slot=accordion-trigger-icon]:size-4',
          className,
        )}
        data-slot="accordion-trigger"
        {...props}
      >
        {children}
        <CaretDownIcon
          className="pointer-events-none shrink-0 group-aria-expanded/accordion-trigger:hidden"
          data-slot="accordion-trigger-icon"
        />
        <CaretUpIcon
          className="pointer-events-none hidden shrink-0 group-aria-expanded/accordion-trigger:inline"
          data-slot="accordion-trigger-icon"
        />
      </AccordionPrimitive.Trigger>
    </AccordionPrimitive.Header>
  );
}

/**
 * Collapsible body of an {@link AccordionItem}. Animates height on open/close.
 *
 * @param props Forwarded to the underlying Base UI Accordion panel.
 */
function AccordionContent({
  className,
  children,
  ...props
}: AccordionPrimitive.Panel.Props) {
  return (
    <AccordionPrimitive.Panel
      className="data-open:animate-accordion-down data-closed:animate-accordion-up overflow-hidden text-sm"
      data-slot="accordion-content"
      {...props}
    >
      <div
        className={cn(
          '[&_a]:hover:text-foreground h-(--accordion-panel-height) pt-0 pb-2.5 data-ending-style:h-0 data-starting-style:h-0 [&_a]:underline [&_a]:underline-offset-3 [&_p:not(:last-child)]:mb-4',
          className,
        )}
      >
        {children}
      </div>
    </AccordionPrimitive.Panel>
  );
}

export {
  Accordion,
  AccordionContent,
  AccordionHeader,
  AccordionItem,
  AccordionTrigger,
};
