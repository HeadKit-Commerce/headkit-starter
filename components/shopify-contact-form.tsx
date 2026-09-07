"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { submitShopifyContact } from "@/lib/shopify-contact-actions";
import type {
  ShopifyContactContext,
  ShopifyContactExtra,
} from "@/lib/shopify-contact";

export type ShopifyContactFormVariant = "contact" | "partnerships";

const SUCCESS_COPY =
  "Thanks — we received your message and will get back to you shortly.";

/**
 * One output shape for both variants. Optional partnership fields stay
 * `string` (empty default) so `useForm` + `zodResolver` agree under
 * `exactOptionalPropertyTypes`.
 */
function contactFormSchema(isPartnerships: boolean) {
  return z.object({
    name: z.string().trim().min(1, "Name is required"),
    email: z.string().trim().email("Enter a valid email"),
    phone: isPartnerships
      ? z.string().trim().min(1, "Phone is required")
      : z.string(),
    venue: isPartnerships
      ? z.string().trim().min(1, "Venue is required")
      : z.string(),
    location: isPartnerships
      ? z.string().trim().min(1, "Location is required")
      : z.string(),
    body: isPartnerships
      ? z.string().trim().min(1, "Tell us about the space")
      : z.string().trim().min(1, "Message is required"),
    subscribe: z.boolean(),
  });
}

type FormValues = z.infer<ReturnType<typeof contactFormSchema>>;

interface ShopifyContactFormProps {
  context?: ShopifyContactContext;
  variant?: ShopifyContactFormVariant;
  extras?: readonly ShopifyContactExtra[];
  disabled?: boolean;
  subscribeEnabled?: boolean;
  subscribeLabel?: string;
}

/**
 * Shopify built-in contact fields.
 * Contact: Name, Email, Phone, Comment.
 * Partnerships / wholesale: Name, Email, Phone, Venue, Location, space notes.
 * Submits via server action to `https://{shop}.myshopify.com/contact`.
 */
export function ShopifyContactForm({
  context,
  variant = "contact",
  extras,
  disabled = false,
  subscribeEnabled = false,
  subscribeLabel = "I want to receive updates",
}: ShopifyContactFormProps): React.ReactElement {
  const resolvedContext =
    context ?? (variant === "partnerships" ? "partnerships" : "contact");
  const isPartnerships = variant === "partnerships";
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const form = useForm<FormValues>({
    resolver: zodResolver(contactFormSchema(isPartnerships)),
    defaultValues: {
      name: "",
      email: "",
      phone: "",
      venue: "",
      location: "",
      body: "",
      subscribe: true,
    },
  });

  if (success) {
    return (
      <div
        className="rounded-lg border border-gray-200 bg-gray-50 p-6 text-sm text-gray-800"
        role="status"
        data-testid="shopify-contact-success"
      >
        {SUCCESS_COPY}
      </div>
    );
  }

  return (
    <Form {...form}>
      <form
        className="space-y-4"
        data-testid="shopify-contact-form"
        data-variant={variant}
        noValidate
        onSubmit={form.handleSubmit(async (values) => {
          setError(null);
          const extraFields: ShopifyContactExtra[] = [...(extras ?? [])];
          if (isPartnerships) {
            extraFields.push(
              { label: "Venue", value: values.venue },
              { label: "Location", value: values.location },
            );
          }
          const result = await submitShopifyContact({
            name: values.name,
            email: values.email,
            phone: values.phone,
            body: values.body,
            context: resolvedContext,
            extras: extraFields,
            subscribe: subscribeEnabled ? values.subscribe : false,
          });
          if (result.ok) {
            setSuccess(true);
            return;
          }
          setError(result.error);
        })}
      >
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Name</FormLabel>
              <FormControl>
                <Input
                  autoComplete="name"
                  disabled={disabled}
                  placeholder="Your name"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email</FormLabel>
              <FormControl>
                <Input
                  autoComplete="email"
                  disabled={disabled}
                  placeholder="you@example.com"
                  type="email"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="phone"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Phone</FormLabel>
              <FormControl>
                <Input
                  autoComplete="tel"
                  disabled={disabled}
                  placeholder={isPartnerships ? "Phone" : "Phone (optional)"}
                  type="tel"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        {isPartnerships ? (
          <>
            <FormField
              control={form.control}
              name="venue"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Venue</FormLabel>
                  <FormControl>
                    <Input
                      disabled={disabled}
                      placeholder="Venue"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="location"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Location</FormLabel>
                  <FormControl>
                    <Input
                      disabled={disabled}
                      placeholder="Location"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </>
        ) : null}
        <FormField
          control={form.control}
          name="body"
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                {isPartnerships ? "Tell us about the space" : "Comment"}
              </FormLabel>
              <FormControl>
                <Textarea
                  disabled={disabled}
                  placeholder={
                    isPartnerships
                      ? "Tell us about the space"
                      : "How can we help?"
                  }
                  rows={5}
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        {subscribeEnabled ? (
          <FormField
            control={form.control}
            name="subscribe"
            render={({ field }) => (
              <FormItem className="flex flex-row items-start space-x-2 space-y-0">
                <FormControl>
                  <Checkbox
                    checked={field.value}
                    disabled={disabled}
                    onCheckedChange={(checked) =>
                      field.onChange(checked === true)
                    }
                  />
                </FormControl>
                <FormLabel className="font-normal leading-snug">
                  {subscribeLabel}
                </FormLabel>
              </FormItem>
            )}
          />
        ) : null}
        {error ? (
          <p className="text-sm text-red-600" role="alert">
            {error}
          </p>
        ) : null}
        <Button disabled={disabled || form.formState.isSubmitting} type="submit">
          {form.formState.isSubmitting ? "Sending…" : "Send"}
        </Button>
      </form>
    </Form>
  );
}
