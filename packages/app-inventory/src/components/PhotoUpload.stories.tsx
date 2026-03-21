import type { Meta, StoryObj } from "@storybook/react-vite";
import { PhotoUpload, type UploadedFile } from "./PhotoUpload";

const meta: Meta<typeof PhotoUpload> = {
  title: "Inventory/PhotoUpload",
  component: PhotoUpload,
  parameters: { layout: "centered" },
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <div className="w-[400px]">
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    onFilesSelected: (files) => console.log("Files selected:", files),
  },
};

export const WithQueuedFiles: Story = {
  args: {
    onFilesSelected: (files) => console.log("Files selected:", files),
    onRemove: (id) => console.log("Remove:", id),
    files: [
      {
        localId: "1",
        file: new File([""], "photo-1.jpg", { type: "image/jpeg" }),
        previewUrl: "https://placehold.co/100x100/1a1a1a/white?text=1",
        status: "done",
      },
      {
        localId: "2",
        file: new File([""], "photo-2.jpg", { type: "image/jpeg" }),
        previewUrl: "https://placehold.co/100x100/1a1a1a/white?text=2",
        status: "uploading",
      },
      {
        localId: "3",
        file: new File([""], "photo-3.jpg", { type: "image/jpeg" }),
        previewUrl: "https://placehold.co/100x100/1a1a1a/white?text=3",
        status: "pending",
      },
      {
        localId: "4",
        file: new File([""], "photo-4.jpg", { type: "image/jpeg" }),
        previewUrl: "https://placehold.co/100x100/1a1a1a/white?text=4",
        status: "error",
        error: "Upload timed out",
      },
    ] satisfies UploadedFile[],
  },
};

export const Disabled: Story = {
  args: {
    onFilesSelected: (files) => console.log("Files selected:", files),
    disabled: true,
  },
};

export const CustomMaxSize: Story = {
  args: {
    onFilesSelected: (files) => console.log("Files selected:", files),
    maxSizeMb: 5,
  },
};
