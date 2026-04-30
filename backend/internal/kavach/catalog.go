package kavach

// Catalog is the canonical, ordered list of every built-in Test that
// Kavach knows how to run. The runner filters this slice by the operator's
// enabled categories. We populate it from per-category `<category>Tests()`
// functions (one per file) so adding a new test = add to its file's slice.
var Catalog []Test

func init() {
	Catalog = append(Catalog, TransportTests()...)
	Catalog = append(Catalog, InfoDisclosureTests()...)
	Catalog = append(Catalog, InjectionTests()...)
	Catalog = append(Catalog, InjectionExtraTests()...)
	Catalog = append(Catalog, MethodTamperingTests()...)
}
