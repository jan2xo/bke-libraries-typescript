import type {
  CatalogCreateEditionInput,
  CatalogCreateProductInput,
  CatalogEditionSnapshot,
  CatalogLicensingVersionFactsSnapshot,
  CatalogProductSnapshot,
  CatalogUpdateEditionInput,
  CatalogUpdateProductInput,
} from "../contracts/catalog.contract";

export interface CatalogRepository {
  findProductById(id: string): Promise<CatalogProductSnapshot | null>;
  findProductBySlug(slug: string): Promise<CatalogProductSnapshot | null>;
  findEditionById(id: string): Promise<CatalogEditionSnapshot | null>;
  listEditions(productId: string): Promise<readonly CatalogEditionSnapshot[]>;
  findLicensingVersionFacts(
    catalogProductId: string,
    requestedVersion: string,
  ): Promise<CatalogLicensingVersionFactsSnapshot | null>;

  createProduct(id: string, input: CatalogCreateProductInput): Promise<CatalogProductSnapshot>;
  updateProduct(input: CatalogUpdateProductInput): Promise<CatalogProductSnapshot | null>;
  publishProduct(id: string): Promise<CatalogProductSnapshot | null>;
  archiveProduct(id: string): Promise<CatalogProductSnapshot | null>;

  createEdition(id: string, input: CatalogCreateEditionInput): Promise<CatalogEditionSnapshot>;
  updateEdition(input: CatalogUpdateEditionInput): Promise<CatalogEditionSnapshot | null>;
  setEditionActive(id: string, active: boolean): Promise<CatalogEditionSnapshot | null>;
}
