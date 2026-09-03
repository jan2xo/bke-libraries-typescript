import type {
  CommerceOfferRedemptionSnapshot,
  CommerceOfferRedemptionTransition,
  CommerceReserveOfferRedemptionInput,
  CommerceReserveOfferRedemptionResult,
  CommerceTransitionOfferRedemptionResult,
} from "../contracts/offer-redemption.contract";

export interface CommerceOfferReservationRequest extends CommerceReserveOfferRedemptionInput {
  readonly codeNormalized: string;
  readonly now: Date;
}

export interface CommerceOfferRedemptionRepository {
  reserve(input: CommerceOfferReservationRequest): Promise<CommerceReserveOfferRedemptionResult>;
  transition(input: {
    readonly redemptionId: string;
    readonly transition: CommerceOfferRedemptionTransition;
    readonly now: Date;
  }): Promise<CommerceTransitionOfferRedemptionResult>;
}

export type { CommerceOfferRedemptionSnapshot };
