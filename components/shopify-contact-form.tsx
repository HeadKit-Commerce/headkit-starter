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
import { submitShopifyContact } from "@/lib/shopify-contact-actions";
import type {
  ShopifyContactContext,
  ShopifyContactExtra,
} from "@/lib/shopify-contact";

const schema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  email: z.string().trim().email("Enter a valid email"),
  phone: z.string().optional(),
  body: z.string().trim().min(1, "Message is required"),
});

type FormValues = z.infer<typeof schema>;

const SUCCESS_COPY =
  "Thanks — we received your message and will get back to you shortly.";

interface ShopifyContactFormProps {
  context?: ShopifyContactContext;
  extras?: readonly ShopifyContactExtra[];
  disabled?: boolean;
}

/**
 * Shopify built-in contact fields (Dawn / Horizon): Name, Email, Phone, Comment.
 * Submits via server action to `https://{shop}.myshopify.com/contact`.
 */
export function ShopifyContactForm({
  context = "contact",
  extras,
  disabled = false,
}: ShopifyContactFormProps): React.ReactElement {
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", email: "", phone: "", body: "" },
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
        noValidate
        onSubmit={form.handleSubmit(async (values) => {
          setError(null);
          const result = await submitShopifyContact({
            name: values.name,
            email: values.email,
            phone: values.phone,
            body: values.body,
            context,
            extras,
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
                  placeholder="Phone (optional)"
                  type="tel"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="body"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Comment</FormLabel>
              <FormControl>
                <Textarea
                  disabled={disabled}
                  placeholder="How can we help?"
                  rows={5}
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
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
