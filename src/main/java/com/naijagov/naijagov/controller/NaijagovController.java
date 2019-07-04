package com.naijagov.naijagov.controller;

import com.naijagov.naijagov.model.Form;
import com.naijagov.naijagov.service.PollingUnitService;

import java.util.Optional;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.web.PageableDefault;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.SessionAttributes;
import org.springframework.web.servlet.ModelAndView;

@Controller
@SessionAttributes({"form"})
public class NaijagovController{

    @GetMapping("/pollingunitsthyme")
    public ModelAndView pollingUnits(@PageableDefault(size=10, sort="fullCode", 
                                direction=Sort.Direction.ASC) Pageable pageable, 
                                @ModelAttribute Form form, ModelAndView mv, 
                                @RequestParam("sortBy") Optional<String> sortBy, 
                                @RequestParam("sortDirection") Optional<Sort.Direction> sortDirection){
        Pageable sortedPage = pageable;
        //initial page load, no params
        if(form.getPollingUnitsPage()==null){
            sortedPage=pageable;
        }
        //when header sort is clicked
        else if(sortBy.isPresent() &&sortDirection.isPresent()) 
            sortedPage = PageRequest.of(form.getPollingUnitsPage().getNumber(), 
                                      form.getPollingUnitsPage().getSize(),
                                      sortDirection.get(), sortBy.get());
        //when navigation link is clicked
        else if(form.getPollingUnitsPage()!=null) 
            sortedPage = PageRequest.of(pageable.getPageNumber(), pageable.getPageSize(), 
                                        form.getPollingUnitsPage().getSort());
        form.setPollingUnitsPage(pollingUnitService.listAllPollingUnits(sortedPage));

        mv.setViewName("pollingunitsthyme");
        return mv;
    }
    
    @ModelAttribute
    public Form form() {
        return new Form();
    }
    
    @Autowired
    public NaijagovController(PollingUnitService pollingUnitService){
        this.pollingUnitService=pollingUnitService;
    }
    private PollingUnitService pollingUnitService;
}
