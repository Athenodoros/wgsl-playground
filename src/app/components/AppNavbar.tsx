import { AnchorButton, Navbar } from "@blueprintjs/core";

export const AppNavbar: React.FC = () => (
    <Navbar fixedToTop={true} className="bp5-dark z-10">
        <Navbar.Group align="left">
            <Navbar.Heading>WGSL Playground</Navbar.Heading>
        </Navbar.Group>
        <Navbar.Group align="right">
            <AnchorButton
                icon="share"
                text="WGSL Spec"
                href="https://www.w3.org/TR/WGSL/"
                variant="outlined"
                target="_blank"
            />
        </Navbar.Group>
    </Navbar>
);
