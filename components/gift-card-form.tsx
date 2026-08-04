"use client";

import { useCallback, useEffect } from "react";
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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { DeliveryType } from "@/components/gift-card-delivery-type";

const getCurrentDate = (): string => {
  const date = new Date();
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, "0");
  const day = date.getDate().toString().padStart(2, "0");
  return `${year}-${month}-${day}`;
};

// Re-export for existing importers; the enum lives in its own module so
// consumers that only need it don't pull this form's react-hook-form/zod
// dependencies into their bundle.
export { DeliveryType };

const giftCardSchema = z.object({
  wc_gc_giftcard_to_multiple: z
    .string()
    .email("Needs to be a correct email")
    .min(1, "This is a required field"),
  wc_gc_giftcard_from: z.string().min(1, "This is a required field"),
  wc_gc_giftcard_message: z.string().max(200, "Message too long").optional(),
  wc_gc_giftcard_delivery: z.string().min(1, "Delivery date is required"),
  wc_gc_giftcard_select_delivery: z.nativeEnum(DeliveryType),
});

export type GiftCardFormValues = z.infer<typeof giftCardSchema>;

interface GiftCardFormProps {
  emitClickEvent: (data: GiftCardFormValues) => void;
  onFormValid?: (isValid: boolean) => void;
}

export function GiftCardForm({
  emitClickEvent,
  onFormValid,
}: GiftCardFormProps) {
  const form = useForm<GiftCardFormValues>({
    resolver: zodResolver(giftCardSchema),
    defaultValues: {
      wc_gc_giftcard_to_multiple: "",
      wc_gc_giftcard_from: "",
      wc_gc_giftcard_message: "",
      // Set on mount (below) — new Date() during render is a current-time
      // read that makes the whole route's prerender dynamic under Cache
      // Components (next-prerender-current-time-client).
      wc_gc_giftcard_delivery: "",
      wc_gc_giftcard_select_delivery: DeliveryType.Now,
    },
  });

  useEffect(() => {
    if (!form.getValues("wc_gc_giftcard_delivery")) {
      form.setValue("wc_gc_giftcard_delivery", getCurrentDate());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleBlur = useCallback(() => {
    onFormValid?.(form.formState.isValid);
  }, [form.formState.isValid, onFormValid]);

  const deliveryType = form.watch("wc_gc_giftcard_select_delivery");

  useEffect(() => {
    const subscription = form.watch((values) => {
      void form.trigger().then((isValid) => {
        if (isValid) emitClickEvent(values as GiftCardFormValues);
      });
    });
    return () => subscription.unsubscribe();
  }, [form, emitClickEvent]);

  return (
    <Form {...form}>
      <form
        onSubmit={(e) => e.preventDefault()}
        className="mt-5 space-y-4"
        onBlur={handleBlur}
      >
        <FormField
          control={form.control}
          name="wc_gc_giftcard_to_multiple"
          render={({ field }) => (
            <FormItem>
              <FormControl>
                <Input
                  {...field}
                  type="email"
                  className="mt-2.5 bg-[#E6E6E6]! bg-opacity-50!"
                  placeholder="Recipient Email"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="wc_gc_giftcard_from"
          render={({ field }) => (
            <FormItem>
              <FormControl>
                <Input
                  {...field}
                  type="text"
                  className="mt-2.5 bg-[#E6E6E6]! bg-opacity-50!"
                  placeholder="From Name"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="wc_gc_giftcard_message"
          render={({ field }) => (
            <FormItem>
              <FormControl>
                <Textarea
                  {...field}
                  className="mb-2.5 mt-2.5 bg-[#E6E6E6]! bg-opacity-50!"
                  placeholder="Add a special message to the recipient (eg. Happy Birthday! Best Wishes. Enjoy this awesome gift from me)"
                  rows={5}
                  maxLength={200}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="space-y-2">
          <FormLabel>Delivery date: </FormLabel>

          <FormField
            control={form.control}
            name="wc_gc_giftcard_select_delivery"
            render={({ field }) => (
              <FormItem>
                <FormControl>
                  <RadioGroup
                    onValueChange={field.onChange}
                    defaultValue={field.value}
                    className="space-y-2"
                  >
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem
                        value={DeliveryType.Now}
                        id="delivery-now"
                      />
                      <Label htmlFor="delivery-now">Now</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem
                        value={DeliveryType.Later}
                        id="delivery-later"
                      />
                      <Label htmlFor="delivery-later">
                        Select delivery date
                      </Label>
                    </div>
                  </RadioGroup>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {deliveryType === DeliveryType.Later && (
          <FormField
            control={form.control}
            name="wc_gc_giftcard_delivery"
            render={({ field }) => (
              <FormItem>
                <FormControl>
                  <Input
                    {...field}
                    type="date"
                    className="mt-1.5 bg-[#E6E6E6]! bg-opacity-50!"
                    placeholder="Enter your delivery date"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        )}
      </form>
    </Form>
  );
}
