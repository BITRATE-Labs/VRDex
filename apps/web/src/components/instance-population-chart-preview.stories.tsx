import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { InstancePopulationChartPreview } from "./instance-population-chart-preview";

const meta = {
  title: "Clubs/Instance population preview",
  component: InstancePopulationChartPreview,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof InstancePopulationChartPreview>;
export default meta;
type Story = StoryObj<typeof meta>;
export const QueueAndGaps: Story = { args: { initialScenario: "paired" } };
export const MissingHistoricalQueue: Story = { args: { initialScenario: "historical" } };
export const ConflictingCounts: Story = { args: { initialScenario: "conflicting" } };
export const ConfirmedClosure: Story = { args: { initialScenario: "closure" } };
