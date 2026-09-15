import { Bank } from "../_lib/models.js";
import { createCollectionIndexHandler } from "../_lib/collection-routes.js";

export default createCollectionIndexHandler(Bank, { allowBulkCreate: true });
